/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("./pool")

/**
 * Gets top scores for a game variant and type.
 *
 * @param {number} gameVariant - Game variant
 * @param {number} gameType - Game type (1=android, 2=bt, 3=web, 4=passplay)
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Array of score objects
 */
async function dbGetTopScores(gameVariant, gameType, limit) {
    try {
        const [rows] = await pool.execute(
            `SELECT ts.*, u.name, u.face, u.uuid
             FROM topscores ts
             JOIN users u ON u.id = ts.user_id
             WHERE ts.game_variant = ? AND ts.game_type = ?
             ORDER BY ts.score DESC
             LIMIT ?`,
            [gameVariant, gameType, limit]
        )
        return rows
    } catch (error) {
        console.error("dbGetTopScores error:", error)
        return []
    }
}

/**
 * Submits a new score.
 *
 * @param {Object} scoreData - Score data
 * @param {number} scoreData.userId - User ID
 * @param {number} scoreData.opponentId - Opponent user ID
 * @param {number} scoreData.score - Score value
 * @param {number} scoreData.timeMs - Time spent in ms
 * @param {number} scoreData.gameType - Game type
 * @param {number} scoreData.gameVariant - Game variant
 * @param {number} scoreData.userRank - User's rank
 * @param {number} scoreData.opponentRank - Opponent's rank
 * @returns {Promise<number|null>} New score ID or null on error
 */
async function dbSubmitScore(scoreData) {
    try {
        const [result] = await pool.execute(
            `INSERT INTO topscores
                (user_id, opponent_id, score, time_spent_ms, game_type, game_variant, user_rank, opponent_rank)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                scoreData.userId,
                scoreData.opponentId,
                scoreData.score,
                scoreData.timeMs,
                scoreData.gameType,
                scoreData.gameVariant,
                scoreData.userRank,
                scoreData.opponentRank,
            ]
        )
        return result.insertId
    } catch (error) {
        console.error("dbSubmitScore error:", error)
        return null
    }
}

module.exports = {
    dbGetTopScores,
    dbSubmitScore,
}
