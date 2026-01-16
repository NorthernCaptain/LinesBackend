/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("../../db/navalclash")
const { logger } = require("../../utils/logger")

/**
 * Serializes a score entry for API response.
 *
 * @param {Object} row - Database row
 * @param {number} position - Position in leaderboard
 * @returns {Object} Serialized score
 */
function serializeScore(row, position) {
    return {
        pos: position,
        id: row.user_id,
        n: row.name,
        f: row.face,
        uuid: row.uuid,
        sc: row.score,
        tm: row.time_spent_ms,
        d: row.created_at,
    }
}

/**
 * Get top scores endpoint - returns leaderboard data.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function getTopScores(req, res) {
    const { uid, limit } = req.body
    const gameVariant = req.body.var || 1
    const gameType = req.body.tp || 3 // Default to web
    const ctx = { reqId: req.requestId, uid, gameVariant, gameType }

    logger.debug(ctx, "Get top scores request")

    const maxResults = Math.min(limit || 10, 50)

    try {
        const [rows] = await pool.execute(
            `SELECT ts.*, u.name, u.face, u.uuid
             FROM topscores ts
             JOIN users u ON u.id = ts.user_id
             WHERE ts.game_variant = ? AND ts.game_type = ?
             ORDER BY ts.score DESC
             LIMIT ?`,
            [gameVariant, gameType, maxResults]
        )

        const scores = rows.map((row, index) => serializeScore(row, index + 1))

        logger.debug({ ...ctx, count: scores.length }, "Returning top scores")
        return res.json({ type: "top", list: scores })
    } catch (error) {
        logger.error(ctx, "getTopScores error:", error.message)
        return res.json({ type: "error", reason: "Database error" })
    }
}

/**
 * Submits a score to the leaderboard.
 *
 * @param {number} userId - User ID
 * @param {number} opponentId - Opponent user ID
 * @param {number} score - Score value
 * @param {number} timeMs - Time spent in ms
 * @param {number} gameType - Game type
 * @param {number} gameVariant - Game variant
 * @param {number} userRank - User's rank
 * @param {number} opponentRank - Opponent's rank
 * @param {Object} ctx - Logging context
 * @returns {Promise<number|null>} New score ID or null on error
 */
async function submitScore(
    userId,
    opponentId,
    score,
    timeMs,
    gameType,
    gameVariant,
    userRank,
    opponentRank,
    ctx
) {
    try {
        const [result] = await pool.execute(
            `INSERT INTO topscores
                (user_id, opponent_id, score, time_spent_ms, game_type, game_variant, user_rank, opponent_rank)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                opponentId,
                score,
                timeMs,
                gameType,
                gameVariant,
                userRank,
                opponentRank,
            ]
        )
        logger.info(
            { ...ctx, userId, score, scoreId: result.insertId },
            "Score submitted to leaderboard"
        )
        return result.insertId
    } catch (error) {
        logger.error(ctx, "submitScore error:", error.message)
        return null
    }
}

module.exports = {
    getTopScores,
    submitScore,
    // Exported for testing
    serializeScore,
}
