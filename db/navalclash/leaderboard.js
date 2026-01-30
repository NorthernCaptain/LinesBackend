/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("./pool")

// Score validation thresholds
const TOPSCORE_THRESHOLD = 3000 // Minimum score to be recorded
const MIN_GAME_TIME_MS = 30000 // Minimum game duration (30 seconds)

/**
 * Gets top scores for a game variant with deduplication.
 * Fetches top 50 vs Android (game_type=1) + top 50 vs Human (game_type 2,3,4).
 * Returns max 1 score per player per category, sorted by score DESC.
 *
 * @param {number} gameVariant - Game variant
 * @param {number} limitPerType - Max results per game type category (default 50)
 * @returns {Promise<Array>} Array of score objects (up to 100 total)
 */
async function dbGetTopScores(gameVariant, limitPerType = 50) {
    try {
        // Fetch top scores vs Android (game_type = 1)
        // Use query() instead of execute() to avoid prepared statement issues with LIMIT
        const [androidRows] = await pool.query(
            `SELECT ts.*, u.name, u.face, u.uuid,
                    o.name AS opponent_name, o.face AS opponent_face
             FROM topscores ts
             JOIN users u ON u.id = ts.user_id
             LEFT JOIN users o ON o.id = ts.opponent_id
             INNER JOIN (
                 SELECT user_id, MAX(score) as max_score
                 FROM topscores
                 WHERE game_variant = ? AND game_type = 1
                 GROUP BY user_id
             ) best ON ts.user_id = best.user_id AND ts.score = best.max_score
             WHERE ts.game_variant = ? AND ts.game_type = 1
             ORDER BY ts.score DESC, ts.created_at ASC
             LIMIT ?`,
            [gameVariant, gameVariant, Number(limitPerType)]
        )

        // Fetch top scores vs Human (game_type IN (2,3,4) - bt, web, passplay)
        const [humanRows] = await pool.query(
            `SELECT ts.*, u.name, u.face, u.uuid,
                    o.name AS opponent_name, o.face AS opponent_face
             FROM topscores ts
             JOIN users u ON u.id = ts.user_id
             LEFT JOIN users o ON o.id = ts.opponent_id
             INNER JOIN (
                 SELECT user_id, MAX(score) as max_score
                 FROM topscores
                 WHERE game_variant = ? AND game_type IN (2, 3, 4)
                 GROUP BY user_id
             ) best ON ts.user_id = best.user_id AND ts.score = best.max_score
             WHERE ts.game_variant = ? AND ts.game_type IN (2, 3, 4)
             ORDER BY ts.score DESC, ts.created_at ASC
             LIMIT ?`,
            [gameVariant, gameVariant, Number(limitPerType)]
        )

        // Combine and sort by score DESC
        const combined = [...androidRows, ...humanRows]
        combined.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score
            return new Date(a.created_at) - new Date(b.created_at)
        })

        return combined
    } catch (error) {
        console.error("dbGetTopScores error:", error)
        return []
    }
}

/**
 * Gets top scores filtered by game type with deduplication.
 *
 * @param {number} gameVariant - Game variant
 * @param {number} gameType - Game type (1=android, 2=bt, 3=web, 4=passplay)
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Array of score objects
 */
async function dbGetTopScoresByType(gameVariant, gameType, limit) {
    try {
        // Note: Use query() instead of execute() to avoid prepared statement issues with LIMIT
        const [rows] = await pool.query(
            `SELECT ts.*, u.name, u.face, u.uuid,
                    o.name AS opponent_name, o.face AS opponent_face
             FROM topscores ts
             JOIN users u ON u.id = ts.user_id
             LEFT JOIN users o ON o.id = ts.opponent_id
             INNER JOIN (
                 SELECT user_id, MAX(score) as max_score
                 FROM topscores
                 WHERE game_variant = ? AND game_type = ?
                 GROUP BY user_id
             ) best ON ts.user_id = best.user_id AND ts.score = best.max_score
             WHERE ts.game_variant = ? AND ts.game_type = ?
             ORDER BY ts.score DESC, ts.created_at ASC
             LIMIT ?`,
            [gameVariant, gameType, gameVariant, gameType, Number(limit)]
        )
        return rows
    } catch (error) {
        console.error("dbGetTopScoresByType error:", error)
        return []
    }
}

/**
 * Checks if a score already exists for this user/score/rank combination.
 * Used to prevent duplicate entries.
 *
 * @param {number} userId - User ID
 * @param {number} score - Score value
 * @param {number} userRank - User's rank
 * @returns {Promise<boolean>} True if duplicate exists
 */
async function dbScoreExists(userId, score, userRank) {
    try {
        const [rows] = await pool.execute(
            `SELECT id FROM topscores
             WHERE user_id = ? AND score = ? AND user_rank = ?
             LIMIT 1`,
            [userId, score, userRank]
        )
        return rows.length > 0
    } catch (error) {
        console.error("dbScoreExists error:", error)
        return true // Assume exists on error to be safe
    }
}

/**
 * Validates and submits a score to the leaderboard.
 * Checks threshold, game duration, and duplicates before inserting.
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
 * @returns {Promise<Object>} Result object { success, reason, scoreId }
 */
async function dbSubmitScore(scoreData) {
    // Validate score threshold
    if (scoreData.score < TOPSCORE_THRESHOLD) {
        return {
            success: false,
            reason: `Score ${scoreData.score} below threshold ${TOPSCORE_THRESHOLD}`,
        }
    }

    // Validate minimum game duration
    if (scoreData.timeMs < MIN_GAME_TIME_MS) {
        return {
            success: false,
            reason: `Game time ${scoreData.timeMs}ms below minimum ${MIN_GAME_TIME_MS}ms`,
        }
    }

    // Check for duplicates
    const exists = await dbScoreExists(
        scoreData.userId,
        scoreData.score,
        scoreData.userRank
    )
    if (exists) {
        return { success: false, reason: "Duplicate score" }
    }

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
        return { success: true, scoreId: result.insertId }
    } catch (error) {
        console.error("dbSubmitScore error:", error)
        return { success: false, reason: error.message }
    }
}

/**
 * Gets a user's best score.
 *
 * @param {number} userId - User ID
 * @param {number} gameVariant - Game variant
 * @returns {Promise<number>} Best score or 0 if none
 */
async function dbGetUserBestScore(userId, gameVariant) {
    try {
        const [rows] = await pool.execute(
            `SELECT MAX(score) as best_score FROM topscores
             WHERE user_id = ? AND game_variant = ?`,
            [userId, gameVariant]
        )
        return rows.length > 0 && rows[0].best_score ? rows[0].best_score : 0
    } catch (error) {
        console.error("dbGetUserBestScore error:", error)
        return 0
    }
}

/**
 * Gets a user's rank on the leaderboard.
 *
 * @param {number} userId - User ID
 * @param {number} gameVariant - Game variant
 * @returns {Promise<number|null>} Rank (1-based) or null if not ranked
 */
async function dbGetUserLeaderboardRank(userId, gameVariant) {
    try {
        // Get user's best score
        const bestScore = await dbGetUserBestScore(userId, gameVariant)
        if (!bestScore) return null

        // Count how many users have a higher best score
        const [rows] = await pool.execute(
            `SELECT COUNT(DISTINCT user_id) as rank
             FROM topscores
             WHERE game_variant = ?
               AND score > ?`,
            [gameVariant, bestScore]
        )
        return rows.length > 0 ? rows[0].rank + 1 : null
    } catch (error) {
        console.error("dbGetUserLeaderboardRank error:", error)
        return null
    }
}

/**
 * Gets top players ranked by total stars.
 * Returns players with highest star accumulation.
 *
 * @param {number} gameVariant - Game variant
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Array of user objects ranked by stars
 */
async function dbGetTopStars(gameVariant, limit) {
    try {
        // Note: Use query() instead of execute() to avoid prepared statement issues with LIMIT
        const [rows] = await pool.query(
            `SELECT id, name, uuid, \`rank\`, stars, face,
                    games, gameswon, version,
                    games_android, games_bluetooth, games_web, games_passplay,
                    wins_android, wins_bluetooth, wins_web, wins_passplay
             FROM users
             WHERE stars > 0
               AND last_game_variant = ?
             ORDER BY stars DESC, gameswon DESC
             LIMIT ?`,
            [gameVariant, Number(limit)]
        )
        return rows
    } catch (error) {
        console.error("dbGetTopStars error:", error)
        return []
    }
}

module.exports = {
    dbGetTopScores,
    dbGetTopScoresByType,
    dbScoreExists,
    dbSubmitScore,
    dbGetUserBestScore,
    dbGetUserLeaderboardRank,
    dbGetTopStars,
    // Constants
    TOPSCORE_THRESHOLD,
    MIN_GAME_TIME_MS,
}
