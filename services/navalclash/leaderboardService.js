/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const {
    dbGetTopScores,
    dbGetTopScoresByType,
    dbSubmitScore,
    dbGetUserLeaderboardRank,
    dbGetTopStars,
    dbFindUserByUuid,
    dbFindUserByUuidAndName,
    dbCreateUser,
    TOPSCORE_THRESHOLD,
    MIN_GAME_TIME_MS,
} = require("../../db/navalclash")
const { logger } = require("../../utils/logger")
const { VERSION } = require("./constants")

/**
 * Serializes a score entry for API response.
 * Matches the client's Score object format with PlayerInfo for user and opponent.
 *
 * @param {Object} row - Database row with user/opponent info
 * @returns {Object} Serialized score matching client format
 */
function serializeScore(row) {
    const result = {
        type: "Score",
        score: row.score,
        time: row.time_spent_ms || 30001, // Fallback to minimum valid time if missing
        gtype: dbGtypeToClient(row.game_type), // Convert DB (1-4) to client (0-3)
        ct: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        // Winner player info
        u: {
            nam: row.name,
            i: row.user_id,
            rk: row.user_rank || 0,
            fc: row.face || 0,
            id: row.uuid || "",
        },
    }

    // Only include opponent if available (client checks has("o") before getJSONObject)
    if (row.opponent_id) {
        result.o = {
            nam: row.opponent_name || "",
            i: row.opponent_id,
            rk: row.opponent_rank || 0,
            fc: row.opponent_face || 0,
        }
    }

    return result
}

/**
 * Serializes a topstars entry for API response.
 * TopStars ranks players by accumulated stars, not individual game scores.
 * Note: Does not include 'o' field - client checks has("o") before getJSONObject.
 *
 * @param {Object} row - User row from database
 * @returns {Object} Serialized star ranking entry
 */
function serializeStarEntry(row) {
    return {
        type: "Score",
        score: row.stars || 0,
        time: 30001, // Minimum valid time (client requires >= 30000ms)
        gtype: 3, // Default to web
        ct: Date.now(),
        u: {
            nam: row.name,
            i: row.id,
            rk: row.rank || 0,
            fc: row.face || 0,
            id: row.uuid || "",
            st: row.stars || 0,
            pld: row.games || 0,
            won: row.gameswon || 0,
            ga: [
                row.games_android || 0,
                row.games_bluetooth || 0,
                row.games_web || 0,
                row.games_passplay || 0,
            ],
            wa: [
                row.wins_android || 0,
                row.wins_bluetooth || 0,
                row.wins_web || 0,
                row.wins_passplay || 0,
            ],
        },
        // No 'o' field - topstars entries don't have opponents
    }
}

// Map client game type to database game type
// Client: 0=Android, 1=Bluetooth, 2=Web, 3=PassPlay
// Database: 1=android, 2=bt, 3=web, 4=passplay
// Conversion: DB = client + 1
function clientGtypeToDb(clientGtype) {
    // Client uses 0-3, DB uses 1-4
    const dbType = (clientGtype || 0) + 1
    // Clamp to valid range 1-4
    return Math.max(1, Math.min(4, dbType))
}

// Map database game type back to client game type
// Database: 1=android, 2=bt, 3=web, 4=passplay
// Client: 0=Android, 1=Bluetooth, 2=Web, 3=PassPlay
// Conversion: client = DB - 1
function dbGtypeToClient(dbGameType) {
    return (dbGameType || 1) - 1
}

/**
 * Checks if a UUID is valid for user lookup/creation.
 * Invalid UUIDs include placeholder values like "android" or "null".
 *
 * @param {string} uuid - UUID to validate
 * @returns {boolean} True if valid
 */
function isValidUuid(uuid) {
    return uuid && uuid !== "android" && uuid !== "null" && uuid.length >= 10
}

/**
 * Gets or creates a user by UUID and name.
 * Mimics the old Java server behavior: if user not found, create them.
 *
 * @param {string} uuid - User UUID
 * @param {string} name - User name
 * @param {number} gameVariant - Game variant for new users
 * @param {Object} ctx - Logging context
 * @returns {Promise<Object|null>} User object or null if invalid UUID
 */
async function getOrCreateUser(uuid, name, gameVariant, ctx) {
    if (!isValidUuid(uuid)) {
        return null
    }

    // First try to find by UUID and name (exact match)
    let user = await dbFindUserByUuidAndName(uuid, name)
    if (user) {
        return user
    }

    // Try to find by UUID only (name might have changed)
    user = await dbFindUserByUuid(uuid)
    if (user) {
        return user
    }

    // User not found - create new user (like old Java server)
    logger.info(
        { ...ctx, uuid, name },
        "Creating new user from client score"
    )
    const newUserId = await dbCreateUser({
        name: name || "Player",
        uuid,
        gameVariant,
    })

    if (newUserId) {
        // Return a minimal user object with the new ID
        return { id: newUserId, name: name || "Player", uuid }
    }

    logger.error({ ...ctx, uuid, name }, "Failed to create user")
    return null
}

/**
 * Processes client scores and inserts valid ones into the database.
 * Creates users if they don't exist (like old Java server).
 *
 * @param {Array} clientScores - Array of score objects from client
 * @param {number} gameVariant - Game variant
 * @param {Object} ctx - Logging context
 * @returns {Promise<number>} Number of scores inserted
 */
async function processClientScores(clientScores, gameVariant, ctx) {
    if (!clientScores || clientScores.length === 0) {
        return 0
    }

    let inserted = 0

    for (const score of clientScores) {
        try {
            // Validate score structure
            if (!score.u || !score.u.id || !score.score || !score.time) {
                logger.debug(
                    { ...ctx, score: score.score },
                    "Skipping score: missing required fields"
                )
                continue
            }

            // Skip scores with invalid UUIDs (like "android")
            if (!isValidUuid(score.u.id)) {
                logger.debug(
                    { ...ctx, uuid: score.u.id },
                    "Skipping score: invalid user UUID"
                )
                continue
            }

            // Get or create user (like old Java server behavior)
            const user = await getOrCreateUser(
                score.u.id,
                score.u.nam,
                gameVariant,
                ctx
            )
            if (!user) {
                logger.debug(
                    { ...ctx, uuid: score.u.id },
                    "Skipping score: failed to get/create user"
                )
                continue
            }

            // Get or create opponent if available
            let opponentId = null
            let opponentRank = 0
            if (score.o && isValidUuid(score.o.id)) {
                const opponent = await getOrCreateUser(
                    score.o.id,
                    score.o.nam,
                    gameVariant,
                    ctx
                )
                if (opponent) {
                    opponentId = opponent.id
                    opponentRank = score.o.rk || 0
                }
            }

            // Map game type from client format (0-3) to DB format (1-4)
            const dbGameType = clientGtypeToDb(score.gtype)

            // Submit score (validation happens in dbSubmitScore)
            const result = await dbSubmitScore({
                userId: user.id,
                opponentId,
                score: score.score,
                timeMs: score.time,
                gameType: dbGameType,
                gameVariant,
                userRank: score.u.rk || 0,
                opponentRank,
            })

            if (result.success) {
                inserted++
                logger.info(
                    { ...ctx, userId: user.id, score: score.score, scoreId: result.scoreId },
                    "Inserted client score"
                )
            }
        } catch (error) {
            logger.error(
                { ...ctx, score: score.score },
                "Error processing client score:",
                error.message
            )
        }
    }

    return inserted
}

/**
 * Get top scores endpoint - returns leaderboard data.
 * Client sends: { type: "topTen", scores: [...], var, v }
 * Server responds: { type: "topTen", scores: [...], var, topstars?: {...} }
 *
 * For clients with version > 30, also includes topstars (ranking by stars).
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function getTopScores(req, res) {
    const gameVariant = req.body.var || 1
    const gameType = req.body.tp // Optional game type filter
    const clientVersion = req.body.v || 0
    const clientScores = req.body.scores || []
    const ctx = { reqId: req.requestId, gameVariant, gameType, v: clientVersion }

    logger.info(
        { ...ctx, clientScoreCount: clientScores.length },
        "TopScores request received"
    )
    logger.info(ctx, "TopScores request body:", JSON.stringify(req.body))

    const maxResults = 50

    try {
        // Process and insert valid client scores before fetching results
        if (clientScores.length > 0) {
            const insertedCount = await processClientScores(
                clientScores,
                gameVariant,
                ctx
            )
            logger.info(
                { ...ctx, insertedCount, totalClientScores: clientScores.length },
                "Processed client scores"
            )
        }

        // Fetch scores - with or without game type filter
        let rows
        if (gameType) {
            rows = await dbGetTopScoresByType(gameVariant, gameType, maxResults)
        } else {
            rows = await dbGetTopScores(gameVariant, maxResults)
        }

        // Serialize scores to client format
        const scores = rows.map((row) => serializeScore(row))

        // Build response
        const response = {
            type: "topTen",
            scores,
            var: gameVariant,
        }

        // Include topstars for clients with version > 30
        if (clientVersion > VERSION.TOPSTARS_MIN) {
            const starRows = await dbGetTopStars(gameVariant, maxResults)
            const starScores = starRows.map((row) => serializeStarEntry(row))

            response.topstars = {
                type: "topTen",
                scores: starScores,
                var: gameVariant,
            }

            logger.info(
                { ...ctx, scoreCount: scores.length, starCount: starScores.length },
                "Returning top scores with topstars"
            )
        } else {
            logger.info({ ...ctx, count: scores.length }, "Returning top scores")
        }

        logger.info(ctx, "TopScores response:", JSON.stringify(response))

        return res.json(response)
    } catch (error) {
        logger.error(ctx, "getTopScores error:", error.message)
        return res.json({ type: "error", reason: "Database error" })
    }
}

/**
 * Submits a score to the leaderboard with validation.
 * Checks threshold, game duration, and duplicates.
 *
 * @param {number} userId - User ID
 * @param {number} opponentId - Opponent user ID
 * @param {number} score - Score value
 * @param {number} timeMs - Time spent in ms
 * @param {number} gameType - Game type (1=android, 2=bt, 3=web, 4=passplay)
 * @param {number} gameVariant - Game variant
 * @param {number} userRank - User's rank
 * @param {number} opponentRank - Opponent's rank
 * @param {Object} ctx - Logging context
 * @returns {Promise<Object>} Result { success, reason, scoreId }
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
    const result = await dbSubmitScore({
        userId,
        opponentId,
        score,
        timeMs,
        gameType,
        gameVariant,
        userRank,
        opponentRank,
    })

    if (result.success) {
        logger.info(
            { ...ctx, userId, score, scoreId: result.scoreId },
            "Score submitted to leaderboard"
        )
    } else {
        logger.debug(
            { ...ctx, userId, score, reason: result.reason },
            "Score not submitted"
        )
    }

    return result
}

/**
 * Gets a user's leaderboard position.
 *
 * @param {number} userId - User ID
 * @param {number} gameVariant - Game variant
 * @returns {Promise<number|null>} Rank (1-based) or null if not ranked
 */
async function getUserLeaderboardRank(userId, gameVariant) {
    return dbGetUserLeaderboardRank(userId, gameVariant)
}

module.exports = {
    getTopScores,
    submitScore,
    getUserLeaderboardRank,
    // Exported for testing
    serializeScore,
    serializeStarEntry,
    // Re-export constants from db layer
    TOPSCORE_THRESHOLD,
    MIN_GAME_TIME_MS,
}
