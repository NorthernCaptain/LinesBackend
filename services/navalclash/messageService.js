/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("../../db/navalclash")
const cluster = require("cluster")
const { v4: uuid } = require("uuid")
const { logger } = require("../../utils/logger")
const { TIMING } = require("./constants")

const pendingPolls = new Map()

/**
 * Computes opponent's session ID by flipping the last bit.
 *
 * @param {BigInt} sessionId - Full session ID
 * @returns {BigInt} Opponent's session ID
 */
function getOpponentSessionId(sessionId) {
    return sessionId ^ 1n
}

/**
 * Gets the base session ID by stripping the player bit.
 *
 * @param {BigInt} sessionId - Full session ID
 * @returns {BigInt} Base session ID (even)
 */
function toBaseSessionId(sessionId) {
    return sessionId & ~1n
}

/**
 * Fetches the next message for a receiver from the database.
 * Messages are stored by sender_session_id, so we look for opponent's messages.
 *
 * @param {BigInt} receiverSessionId - Full session ID of receiver
 * @param {BigInt} afterMsgId - Only fetch messages after this ID
 * @returns {Promise<Object|null>} Message object or null
 */
async function fetchNextMessage(receiverSessionId, afterMsgId) {
    const senderSessionId = getOpponentSessionId(receiverSessionId)

    const [rows] = await pool.execute(
        `SELECT msg_id, msg_type, body, created_at
         FROM session_messages
         WHERE sender_session_id = ? AND msg_id > ?
         ORDER BY msg_id ASC
         LIMIT 1`,
        [senderSessionId.toString(), afterMsgId.toString()]
    )

    if (rows.length === 0) return null

    const row = rows[0]
    return {
        msg_id: row.msg_id,
        msg_type: row.msg_type,
        body: typeof row.body === "string" ? JSON.parse(row.body) : row.body,
    }
}

/**
 * Fetches message and sends response, cleaning up the poll.
 *
 * @param {Object} pollData - Poll data object
 * @returns {Promise<void>}
 */
async function fetchAndRespond(pollData) {
    const { res, sessionId, afterMsgId, requestId } = pollData
    const ctx = { sid: sessionId, reqId: requestId }

    // Guard against duplicate responses
    if (pollData.responded) {
        logger.debug(ctx, "fetchAndRespond skipped (already responded)")
        return
    }
    pollData.responded = true

    clearTimeout(pollData.timer)
    pendingPolls.delete(requestId)

    // Only send IPC if we're in a cluster worker
    if (cluster.isWorker) {
        process.send({
            nc: true,
            type: "UNSUBSCRIBE",
            requestId,
        })
    }

    try {
        const message = await fetchNextMessage(sessionId, afterMsgId)

        if (message) {
            logger.debug(
                { ...ctx, msgId: message.msg_id, msgType: message.msg_type },
                `Poll returning message: ${message.msg_type}`
            )
            res.json({
                type: message.msg_type,
                msgId: message.msg_id.toString(),
                ...message.body,
            })
        } else {
            logger.debug(ctx, "Poll returning empty (no message after wake)")
            res.json({ type: "empty" })
        }
    } catch (error) {
        logger.error(ctx, "fetchAndRespond error:", error.message)
        res.json({ type: "error", reason: "Database error" })
    }
}

/**
 * Handles WAKE message from master.
 *
 * @param {string} requestId - Request ID
 * @returns {void}
 */
function handleWake(requestId) {
    const pollData = pendingPolls.get(requestId)
    if (!pollData) {
        logger.debug(
            { reqId: requestId },
            "WAKE received but poll not found (already responded)"
        )
        return
    }
    logger.debug(
        { sid: pollData.sessionId, reqId: requestId },
        "WAKE received, fetching message"
    )
    fetchAndRespond(pollData)
}

/**
 * Handles CANCEL message from master.
 *
 * @param {string} requestId - Request ID
 * @returns {void}
 */
function handleCancel(requestId) {
    const pollData = pendingPolls.get(requestId)
    if (!pollData) return

    logger.debug(
        { sid: pollData.sessionId, reqId: requestId },
        "CANCEL received, returning empty"
    )
    clearTimeout(pollData.timer)
    pendingPolls.delete(requestId)
    pollData.res.json({ type: "empty" })
}

let workerHandlersSetup = false

/**
 * Sets up worker message handlers for IPC.
 * Only runs in cluster worker mode.
 */
function setupWorkerHandlers() {
    if (!cluster.isWorker) return
    if (workerHandlersSetup) return
    workerHandlersSetup = true

    process.on("message", (msg) => {
        if (!msg.nc) return

        switch (msg.type) {
            case "WAKE":
                handleWake(msg.requestId)
                break
            case "CANCEL":
                handleCancel(msg.requestId)
                break
        }
    })
}

// Setup handlers when module is loaded
setupWorkerHandlers()

/**
 * Deletes acknowledged messages from the queue.
 * Deletes messages sent by opponent (which receiver has now seen).
 *
 * @param {BigInt} receiverSessionId - Full session ID of receiver
 * @param {BigInt} upToMsgId - Delete messages up to this ID
 * @returns {Promise<void>}
 */
async function deleteAcknowledgedMessages(receiverSessionId, upToMsgId) {
    const senderSessionId = getOpponentSessionId(receiverSessionId)

    await pool.execute(
        `DELETE FROM session_messages
         WHERE sender_session_id = ? AND msg_id <= ?
         LIMIT 10`,
        [senderSessionId.toString(), upToMsgId.toString()]
    )
}

/**
 * Sets up a long poll for waiting on new messages.
 *
 * @param {Object} res - Express response
 * @param {BigInt} sessionId - Full session ID (includes player bit)
 * @param {BigInt} afterMsgId - After message ID
 * @param {number} clientPollId - Client poll ID
 * @param {string} requestId - Request ID from middleware
 * @returns {string} Request ID
 */
function setupLongPoll(res, sessionId, afterMsgId, clientPollId, requestId) {
    const ctx = { sid: sessionId, reqId: requestId }

    logger.debug(
        { ...ctx, pollId: clientPollId, after: afterMsgId },
        "Setting up long poll"
    )

    const timer = setTimeout(() => {
        const pollData = pendingPolls.get(requestId)
        if (pollData && !pollData.responded) {
            pollData.responded = true
            logger.debug(ctx, "Poll timeout, returning empty")
            pendingPolls.delete(requestId)
            if (cluster.isWorker) {
                process.send({
                    nc: true,
                    type: "UNSUBSCRIBE",
                    requestId,
                })
            }
            pollData.res.json({ type: "empty" })
        }
    }, TIMING.POLL_TIMEOUT_MS)

    pendingPolls.set(requestId, {
        res,
        timer,
        sessionId,
        afterMsgId,
        requestId,
        responded: false,
    })

    if (cluster.isWorker) {
        process.send({
            nc: true,
            type: "SUBSCRIBE",
            sessionId: sessionId.toString(),
            pollId: clientPollId,
            requestId,
        })
    }

    return requestId
}

/**
 * Poll endpoint - long-polls for messages.
 * Session ID already contains player info in last bit.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function poll(req, res) {
    const { sid, after, pollId } = req.body
    const requestId = req.requestId
    const ctx = { sid, reqId: requestId }

    if (!sid) {
        logger.warn({ reqId: requestId }, "Poll request missing session ID")
        return res.json({ type: "error", reason: "No session ID" })
    }

    const sessionId = BigInt(sid)
    const afterMsgId = after ? BigInt(after) : 0n
    const clientPollId = pollId || Date.now()

    logger.debug({ ...ctx, after: afterMsgId }, "Poll request received")

    try {
        // Keep session alive - update updated_at so matchmaking can find waiting sessions
        await pool.execute(
            `UPDATE game_sessions SET updated_at = NOW(3)
             WHERE id = ? AND status = 0`,
            [toBaseSessionId(sessionId).toString()]
        )

        // Acknowledge previously received messages
        if (afterMsgId > 0n) {
            await deleteAcknowledgedMessages(sessionId, afterMsgId)
            logger.debug(ctx, `Acknowledged messages up to ${afterMsgId}`)
        }

        // Check for existing messages first
        const message = await fetchNextMessage(sessionId, afterMsgId)

        if (message) {
            logger.debug(
                { ...ctx, msgId: message.msg_id, msgType: message.msg_type },
                `Immediate message available: ${message.msg_type}`
            )
            return res.json({
                type: message.msg_type,
                msgId: message.msg_id.toString(),
                ...message.body,
            })
        }

        // No message available, set up long poll
        setupLongPoll(
            res,
            sessionId,
            afterMsgId,
            clientPollId,
            requestId
        )

        // Race condition check - message might have arrived while setting up
        const raceCheck = await fetchNextMessage(sessionId, afterMsgId)
        if (raceCheck && pendingPolls.has(requestId)) {
            logger.debug(ctx, "Race condition detected, message arrived during setup")
            fetchAndRespond(pendingPolls.get(requestId))
        }
    } catch (error) {
        logger.error(ctx, "Poll error:", error.message)
        return res.json({ type: "error", reason: "Server error" })
    }
}

/**
 * Sends a message to the session queue.
 * Message is stored with sender's full session ID.
 *
 * @param {BigInt} senderSessionId - Full session ID of sender (includes player bit)
 * @param {string} msgType - Message type
 * @param {Object} body - Message body
 * @returns {Promise<number>} New message ID
 */
async function sendMessage(senderSessionId, msgType, body) {
    const [result] = await pool.execute(
        `INSERT INTO session_messages (sender_session_id, msg_type, body)
         VALUES (?, ?, ?)`,
        [senderSessionId.toString(), msgType, JSON.stringify(body)]
    )

    const msgId = result.insertId
    const opponentSid = getOpponentSessionId(senderSessionId)

    logger.debug(
        { sid: senderSessionId, toSid: opponentSid, msgId, msgType },
        `Message sent: ${msgType}`
    )

    // Notify opponent via cluster broker
    if (cluster.isWorker) {
        process.send({
            nc: true,
            type: "PUBLISH",
            senderSessionId: senderSessionId.toString(),
        })
    }

    return msgId
}

/**
 * Send endpoint - sends a message to the opponent.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function send(req, res) {
    const { sid, msgType, ...body } = req.body
    const requestId = req.requestId
    const ctx = { reqId: requestId, sid, msgType }

    if (!sid) {
        logger.warn({ reqId: requestId }, "Send request missing session ID")
        return res.json({ type: "error", reason: "No session ID" })
    }

    if (!msgType) {
        logger.warn({ reqId: requestId, sid }, "Send request missing message type")
        return res.json({ type: "error", reason: "No message type" })
    }

    logger.debug(ctx, `Send request: ${msgType}`)

    try {
        const sessionId = BigInt(sid)
        const msgId = await sendMessage(sessionId, msgType, body)

        logger.info({ ...ctx, msgId }, `Message ${msgType} sent successfully`)

        return res.json({
            type: "ok",
            msgId: msgId.toString(),
        })
    } catch (error) {
        logger.error(ctx, "Send error:", error.message)
        return res.json({ type: "error", reason: "Server error" })
    }
}

/**
 * Gets the count of pending polls (for testing/monitoring).
 *
 * @returns {number} Number of pending polls
 */
function getPendingPollCount() {
    return pendingPolls.size
}

/**
 * Clears all pending polls (for testing).
 *
 * @returns {void}
 */
function clearPendingPolls() {
    for (const [, pollData] of pendingPolls) {
        clearTimeout(pollData.timer)
    }
    pendingPolls.clear()
}

module.exports = {
    poll,
    send,
    sendMessage,
    getOpponentSessionId,
    fetchNextMessage,
    deleteAcknowledgedMessages,
    getPendingPollCount,
    clearPendingPolls,
    // Exported for testing
    handleWake,
    handleCancel,
}
