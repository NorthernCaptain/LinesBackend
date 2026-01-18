/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("./pool")

/**
 * Finds a game session by ID.
 *
 * @param {BigInt|string} sessionId - Session ID
 * @returns {Promise<Object|null>} Session object or null if not found
 */
async function dbFindSessionById(sessionId) {
    try {
        const [rows] = await pool.execute(
            "SELECT * FROM game_sessions WHERE id = ?",
            [sessionId.toString()]
        )
        return rows.length > 0 ? rows[0] : null
    } catch (error) {
        console.error("dbFindSessionById error:", error)
        return null
    }
}

/**
 * Creates a new game session.
 *
 * @param {BigInt} sessionId - Generated session ID
 * @param {number} userId - First player's user ID
 * @param {number} version - App version
 * @param {number} gameVariant - Game variant (1=classic, etc.)
 * @returns {Promise<boolean>} True if created successfully
 */
async function dbCreateSession(sessionId, userId, version, gameVariant) {
    try {
        await pool.execute(
            `INSERT INTO game_sessions
                (id, user_one_id, user_one_connected_at, version_one, game_variant, status)
             VALUES (?, ?, NOW(3), ?, ?, 0)`,
            [sessionId.toString(), userId, version, gameVariant]
        )
        return true
    } catch (error) {
        console.error("dbCreateSession error:", error)
        return false
    }
}

/**
 * Finds a waiting session for matchmaking.
 *
 * @param {number} excludeUserId - User ID to exclude from matching
 * @param {number} gameVariant - Game variant to match
 * @param {Object} conn - Database connection (for transaction)
 * @returns {Promise<Object|null>} Waiting session or null
 */
async function dbFindWaitingSession(excludeUserId, gameVariant, conn) {
    const db = conn || pool
    try {
        const [rows] = await db.execute(
            `SELECT gs.*, u.name as user_one_name
             FROM game_sessions gs
             JOIN users u ON u.id = gs.user_one_id
             WHERE gs.status = 0
               AND gs.user_two_id IS NULL
               AND gs.user_one_id != ?
               AND gs.game_variant = ?
               AND gs.updated_at > DATE_SUB(NOW(3), INTERVAL 2 MINUTE)
             ORDER BY gs.created_at ASC
             LIMIT 1
             FOR UPDATE`,
            [excludeUserId, gameVariant]
        )
        return rows.length > 0 ? rows[0] : null
    } catch (error) {
        console.error("dbFindWaitingSession error:", error)
        return null
    }
}

/**
 * Joins a user to an existing session as player two.
 *
 * @param {BigInt|string} sessionId - Session ID
 * @param {number} userId - Second player's user ID
 * @param {number} version - App version
 * @param {Object} conn - Database connection (for transaction)
 * @returns {Promise<boolean>} True if joined successfully
 */
async function dbJoinSession(sessionId, userId, version, conn) {
    const db = conn || pool
    try {
        await db.execute(
            `UPDATE game_sessions SET
                user_two_id = ?,
                user_two_connected_at = NOW(3),
                version_two = ?,
                status = 1,
                updated_at = NOW(3)
             WHERE id = ?`,
            [userId, version, sessionId.toString()]
        )
        return true
    } catch (error) {
        console.error("dbJoinSession error:", error)
        return false
    }
}

/**
 * Updates session status to finished.
 *
 * @param {BigInt|string} sessionId - Session ID
 * @param {number} status - Finish status code
 * @param {number|null} winnerId - Winner user ID
 * @param {number|null} score - Final score
 * @returns {Promise<boolean>} True if updated successfully
 */
async function dbFinishSession(sessionId, status, winnerId, score) {
    try {
        await pool.execute(
            `UPDATE game_sessions SET
                status = ?,
                winner_id = ?,
                score = ?,
                finished_at = NOW(3)
             WHERE id = ?`,
            [status, winnerId, score, sessionId.toString()]
        )
        return true
    } catch (error) {
        console.error("dbFinishSession error:", error)
        return false
    }
}

/**
 * Increments move count for a player.
 *
 * @param {BigInt|string} sessionId - Session ID
 * @param {number} player - Player number (0 or 1)
 * @returns {Promise<boolean>} True if updated successfully
 */
async function dbIncrementMoves(sessionId, player) {
    const moveColumn = player === 0 ? "moves_one" : "moves_two"
    try {
        await pool.execute(
            `UPDATE game_sessions SET ${moveColumn} = ${moveColumn} + 1, updated_at = NOW(3)
             WHERE id = ?`,
            [sessionId.toString()]
        )
        return true
    } catch (error) {
        console.error("dbIncrementMoves error:", error)
        return false
    }
}

/**
 * Gets configuration value by name.
 *
 * @param {string} name - Config name
 * @returns {Promise<Object|null>} Config object or null
 */
async function dbGetConfig(name) {
    try {
        const [rows] = await pool.execute(
            "SELECT * FROM gamesetup WHERE name = ?",
            [name]
        )
        return rows.length > 0 ? rows[0] : null
    } catch (error) {
        console.error("dbGetConfig error:", error)
        return null
    }
}

/**
 * Session finish status codes.
 */
const SESSION_STATUS = {
    WAITING: 0, // Waiting for second player
    IN_PROGRESS: 1, // Both players connected, game in progress
    FINISHED_OK: 10, // Game finished normally
    FINISHED_TERMINATED_WAITING: 2,
    FINISHED_SURRENDERED_AUTO: 3,
    FINISHED_SURRENDERED: 4,
    FINISHED_TIMED_OUT_WAITING: 5,
    FINISHED_TIMED_OUT_PLAYING: 6,
    FINISHED_TERMINATED_DUPLICATE: 7,
    FINISHED_LEFT_OLD: 8,
    FINISHED_NOT_PINGABLE: 9,
    FINISHED_TIMED_BANNED: 10,
    FINISHED_SLEEP_CHEATER: 11,
}

/**
 * Terminates all active sessions for a user (when they reconnect with a new session).
 * Sets status to FINISHED_TERMINATED_DUPLICATE (7).
 *
 * @param {number} userId - User ID
 * @param {Object} conn - Database connection (for transaction)
 * @returns {Promise<number>} Number of sessions terminated
 */
async function dbTerminateUserSessions(userId, conn) {
    const db = conn || pool
    try {
        const [result] = await db.execute(
            `UPDATE game_sessions SET
                status = ?,
                finished_at = NOW(3)
             WHERE (user_one_id = ? OR user_two_id = ?)
               AND status < 10`,
            [SESSION_STATUS.FINISHED_TERMINATED_DUPLICATE, userId, userId]
        )
        return result.affectedRows
    } catch (error) {
        console.error("dbTerminateUserSessions error:", error)
        return 0
    }
}

module.exports = {
    SESSION_STATUS,
    dbFindSessionById,
    dbCreateSession,
    dbFindWaitingSession,
    dbJoinSession,
    dbFinishSession,
    dbIncrementMoves,
    dbGetConfig,
    dbTerminateUserSessions,
}
