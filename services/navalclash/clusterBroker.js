/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const cluster = require("cluster")
const { logger } = require("../../utils/logger")

// Master process state: sessionId -> { pollId, requestId, workerId }
const activePolls = new Map()
const requestToSession = new Map()

/**
 * Computes opponent's session ID by flipping the last bit.
 *
 * @param {string} sessionId - Session ID as string
 * @returns {string} Opponent's session ID as string
 */
function getOpponentSessionId(sessionId) {
    const id = BigInt(sessionId)
    return (id ^ 1n).toString()
}

/**
 * Cancels an existing poll by sending CANCEL message to its worker.
 *
 * @param {Object} existing - Existing poll data
 * @returns {void}
 */
function cancelExistingPoll(existing) {
    const ctx = { reqId: existing.requestId, workerId: existing.workerId }
    const oldWorker = cluster.workers[existing.workerId]
    if (oldWorker) {
        logger.debug(ctx, "Cancelling existing poll")
        oldWorker.send({
            nc: true,
            type: "CANCEL",
            requestId: existing.requestId,
        })
    } else {
        logger.debug(ctx, "Cannot cancel poll, worker not found")
    }
    requestToSession.delete(existing.requestId)
}

/**
 * Handles SUBSCRIBE message from worker.
 * Session ID already contains player info (last bit).
 *
 * @param {Object} worker - Cluster worker
 * @param {Object} msg - Message object with sessionId, pollId, requestId
 * @returns {void}
 */
function handleSubscribe(worker, msg) {
    const { sessionId, pollId, requestId } = msg
    const ctx = { sid: sessionId, reqId: requestId, workerId: worker.id }
    const existing = activePolls.get(sessionId)

    if (existing) {
        if (pollId > existing.pollId) {
            logger.debug(
                { ...ctx, oldPollId: existing.pollId, newPollId: pollId },
                "Replacing older poll with newer"
            )
            cancelExistingPoll(existing)
        } else if (pollId < existing.pollId) {
            logger.debug(
                { ...ctx, oldPollId: existing.pollId, newPollId: pollId },
                "Cancelling stale poll request"
            )
            worker.send({
                nc: true,
                type: "CANCEL",
                requestId: requestId,
            })
            return
        }
    }

    logger.debug({ ...ctx, pollId }, "Poll subscribed")
    activePolls.set(sessionId, { pollId, requestId, workerId: worker.id })
    requestToSession.set(requestId, sessionId)
}

/**
 * Handles UNSUBSCRIBE message from worker.
 *
 * @param {Object} msg - Message object
 * @returns {void}
 */
function handleUnsubscribe(msg) {
    const { requestId } = msg
    const sessionId = requestToSession.get(requestId)
    const ctx = { sid: sessionId, reqId: requestId }

    if (sessionId) {
        const existing = activePolls.get(sessionId)
        if (existing && existing.requestId === requestId) {
            logger.debug(ctx, "Poll unsubscribed")
            activePolls.delete(sessionId)
        } else {
            logger.debug(ctx, "Poll unsubscribe skipped (requestId mismatch)")
        }
        requestToSession.delete(requestId)
    } else {
        logger.debug(ctx, "Poll unsubscribe ignored (unknown requestId)")
    }
}

/**
 * Handles PUBLISH message - wakes the receiver's poll.
 * Computes receiver's session ID by flipping sender's last bit.
 *
 * @param {Object} msg - Message object with senderSessionId
 * @returns {void}
 */
function handlePublish(msg) {
    const { senderSessionId } = msg
    const receiverSessionId = getOpponentSessionId(senderSessionId)
    const ctx = { senderSid: senderSessionId, receiverSid: receiverSessionId }

    const poll = activePolls.get(receiverSessionId)
    if (poll) {
        const worker = cluster.workers[poll.workerId]
        if (worker) {
            logger.debug(
                { ...ctx, reqId: poll.requestId, workerId: poll.workerId },
                "Waking receiver poll"
            )
            worker.send({
                nc: true,
                type: "WAKE",
                requestId: poll.requestId,
            })
        } else {
            logger.debug(
                { ...ctx, workerId: poll.workerId },
                "Cannot wake poll, worker not found"
            )
        }
    } else {
        logger.debug(ctx, "No active poll for receiver")
    }
}

const setupWorkers = new Set()

/**
 * Sets up message handlers for a worker.
 *
 * @param {Object} worker - Cluster worker
 * @returns {void}
 */
function setupWorkerHandlers(worker) {
    if (setupWorkers.has(worker.id)) {
        logger.debug({ workerId: worker.id }, "Worker handlers already set up, skipping")
        return
    }
    setupWorkers.add(worker.id)

    worker.on("message", (msg) => {
        if (!msg.nc) return

        switch (msg.type) {
            case "SUBSCRIBE":
                handleSubscribe(worker, msg)
                break
            case "UNSUBSCRIBE":
                handleUnsubscribe(msg)
                break
            case "PUBLISH":
                handlePublish(msg)
                break
        }
    })
}

let masterBrokerSetup = false

/**
 * Sets up the master broker for handling IPC messages.
 * Must be called from the master process.
 *
 * @returns {void}
 */
function setupMasterBroker() {
    if (!cluster.isMaster && !cluster.isPrimary) return
    if (masterBrokerSetup) {
        logger.debug({}, "Master broker already set up, skipping")
        return
    }
    masterBrokerSetup = true

    const workerCount = Object.keys(cluster.workers || {}).length
    logger.info({}, `Master broker starting with ${workerCount} workers`)

    for (const id in cluster.workers) {
        setupWorkerHandlers(cluster.workers[id])
    }

    cluster.on("fork", (worker) => {
        logger.debug({ workerId: worker.id }, "Setting up handlers for new worker")
        setupWorkerHandlers(worker)
    })

    logger.info({}, "Master broker ready")
}

/**
 * Gets the count of active polls (for testing/monitoring).
 *
 * @returns {number} Number of active polls
 */
function getActivePollCount() {
    return activePolls.size
}

/**
 * Clears all polls (for testing).
 *
 * @returns {void}
 */
function clearAllPolls() {
    activePolls.clear()
    requestToSession.clear()
}

module.exports = {
    setupMasterBroker,
    getActivePollCount,
    clearAllPolls,
    // Exported for testing
    handleSubscribe,
    handleUnsubscribe,
    handlePublish,
    getOpponentSessionId,
}
