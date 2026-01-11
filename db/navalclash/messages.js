/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("./pool")

/**
 * Computes opponent's session ID by flipping the last bit.
 *
 * @param {BigInt} sessionId - Player's session ID
 * @returns {BigInt} Opponent's session ID
 */
function getOpponentSessionId(sessionId) {
    return sessionId ^ 1n
}

/**
 * Inserts a message into the session queue.
 *
 * @param {BigInt|string} senderSessionId - Sender's full session ID
 * @param {string} msgType - Message type
 * @param {Object} body - Message body
 * @returns {Promise<number|null>} New message ID or null on error
 */
async function dbInsertMessage(senderSessionId, msgType, body) {
    try {
        const [result] = await pool.execute(
            `INSERT INTO session_messages (sender_session_id, msg_type, body)
             VALUES (?, ?, ?)`,
            [senderSessionId.toString(), msgType, JSON.stringify(body)]
        )
        return result.insertId
    } catch (error) {
        console.error("dbInsertMessage error:", error)
        return null
    }
}

/**
 * Fetches the next message for a player.
 * Messages are sent BY the opponent, so we query where sender = opponent.
 *
 * @param {BigInt|string} receiverSessionId - Receiver's full session ID
 * @param {BigInt|string} afterMsgId - Only fetch messages after this ID
 * @returns {Promise<Object|null>} Message object or null
 */
async function dbFetchNextMessage(receiverSessionId, afterMsgId) {
    const opponentSessionId = getOpponentSessionId(BigInt(receiverSessionId))
    try {
        const [rows] = await pool.execute(
            `SELECT msg_id, msg_type, body, created_at
             FROM session_messages
             WHERE sender_session_id = ? AND msg_id > ?
             ORDER BY msg_id ASC
             LIMIT 1`,
            [opponentSessionId.toString(), afterMsgId.toString()]
        )
        if (rows.length === 0) return null
        const row = rows[0]
        return {
            msg_id: row.msg_id,
            msg_type: row.msg_type,
            body:
                typeof row.body === "string" ? JSON.parse(row.body) : row.body,
        }
    } catch (error) {
        console.error("dbFetchNextMessage error:", error)
        return null
    }
}

/**
 * Deletes acknowledged messages from the opponent.
 *
 * @param {BigInt|string} receiverSessionId - Receiver's full session ID
 * @param {BigInt|string} upToMsgId - Delete messages up to this ID
 * @returns {Promise<boolean>} True if successful
 */
async function dbDeleteAcknowledgedMessages(receiverSessionId, upToMsgId) {
    const opponentSessionId = getOpponentSessionId(BigInt(receiverSessionId))
    try {
        await pool.execute(
            `DELETE FROM session_messages
             WHERE sender_session_id = ? AND msg_id <= ?
             LIMIT 10`,
            [opponentSessionId.toString(), upToMsgId.toString()]
        )
        return true
    } catch (error) {
        console.error("dbDeleteAcknowledgedMessages error:", error)
        return false
    }
}

/**
 * Deletes old messages (cleanup).
 *
 * @param {number} hoursOld - Delete messages older than this
 * @param {number} limit - Max messages to delete
 * @returns {Promise<number>} Number of deleted messages
 */
async function dbDeleteOldMessages(hoursOld, limit) {
    try {
        const [result] = await pool.execute(
            `DELETE FROM session_messages
             WHERE created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)
             LIMIT ?`,
            [hoursOld, limit]
        )
        return result.affectedRows
    } catch (error) {
        console.error("dbDeleteOldMessages error:", error)
        return 0
    }
}

module.exports = {
    dbInsertMessage,
    dbFetchNextMessage,
    dbDeleteAcknowledgedMessages,
    dbDeleteOldMessages,
    getOpponentSessionId,
}
