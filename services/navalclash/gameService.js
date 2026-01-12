/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("../../db/navalclash")
const { sendMessage } = require("./messageService")
const { logger } = require("../../utils/logger")

/**
 * Validates session ID from request.
 * Returns full session ID and derived player/baseSessionId for DB operations.
 *
 * @param {string} sid - Session ID string
 * @param {Object} res - Express response
 * @param {Object} ctx - Logging context
 * @returns {Object|null} Session info object or null if invalid
 */
function validateSession(sid, res, ctx) {
    if (!sid) {
        logger.warn(ctx, "Request missing session ID")
        res.json({ type: "error", reason: "No session" })
        return null
    }
    const sessionId = BigInt(sid)
    if (sessionId === 0n) {
        logger.warn(ctx, "Invalid session ID: 0")
        res.json({ type: "error", reason: "Invalid session" })
        return null
    }
    return {
        sessionId,
        player: Number(sessionId % 2n),
        baseSessionId: sessionId & ~1n,
    }
}

/**
 * Sends a simple message and returns ok response.
 *
 * @param {Object} res - Express response
 * @param {BigInt} senderSessionId - Full session ID of sender
 * @param {string} msgType - Message type
 * @param {Object} body - Message body
 * @param {Object} ctx - Logging context
 * @returns {Promise<Object>} JSON response
 */
async function sendAndRespond(res, senderSessionId, msgType, body, ctx) {
    await sendMessage(senderSessionId, msgType, body)
    logger.debug(ctx, `Message ${msgType} forwarded to opponent`)
    return res.json({ type: "ok" })
}

/**
 * Greeting endpoint - sends greeting to opponent.
 * Client sends: { sid, u, v, ni }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function greeting(req, res) {
    const { sid, u, v, ni } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Greeting request")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    return sendAndRespond(res, session.sessionId, "greeting", { u, v, ni }, ctx)
}

/**
 * Field request endpoint - requests opponent's field info.
 * Client sends: { sid, lastshot }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function fieldRequest(req, res) {
    const { sid, lastshot } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Field request")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    return sendAndRespond(res, session.sessionId, "fldreq", { lastshot }, ctx)
}

/**
 * Stores field data in the database.
 *
 * @param {BigInt} baseSessionId - Base session ID (without player bit)
 * @param {number} player - Player number (0 or 1)
 * @param {Object} fieldJson - Field JSON data
 * @param {Object} ctx - Logging context
 * @returns {Promise<boolean>} True if successful
 */
async function storeFieldData(baseSessionId, player, fieldJson, ctx) {
    const conn = await pool.getConnection()
    try {
        const [sessions] = await conn.execute(
            "SELECT user_one_id, user_two_id FROM game_sessions WHERE id = ?",
            [baseSessionId.toString()]
        )

        if (sessions.length === 0) {
            logger.warn(ctx, "Session not found for field storage")
            return false
        }

        const userId =
            player === 0 ? sessions[0].user_one_id : sessions[0].user_two_id

        if (!userId) {
            // User ID might be null if opponent hasn't fully connected yet
            // Log but don't fail - the game can still proceed
            logger.warn(
                { ...ctx, player, uid1: sessions[0].user_one_id, uid2: sessions[0].user_two_id },
                "User ID is null for player, skipping field storage"
            )
            return true // Return true to allow game to continue
        }

        await conn.execute(
            `INSERT INTO gamefields (session_id, player, user_id, field_json)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE field_json = VALUES(field_json)`,
            [baseSessionId.toString(), player, userId, JSON.stringify(fieldJson)]
        )

        logger.debug({ ...ctx, player, userId }, "Field data stored")
        return true
    } catch (error) {
        logger.error(ctx, "storeFieldData error:", error.message)
        return false
    } finally {
        conn.release()
    }
}

/**
 * Field info endpoint - sends field info to opponent.
 * Client sends: { sid, json, player, device, uuuid, lastshot, u, whosturn, myfld, mysc, bns, rating }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function fieldInfo(req, res) {
    const {
        sid,
        json,
        player,
        device,
        uuuid,
        lastshot,
        u,
        whosturn,
        myfld,
        mysc,
        bns,
        rating,
    } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Field info request")

    if (!json) {
        logger.warn(ctx, "Field info missing json data")
        return res.json({ type: "error", reason: "Invalid request" })
    }

    const session = validateSession(sid, res, ctx)
    if (!session) return

    const stored = await storeFieldData(
        session.baseSessionId,
        session.player,
        json,
        ctx
    )
    if (!stored) {
        return res.json({
            type: "error",
            errcode: 5,
            reason: "Session not found",
        })
    }

    // Forward all fields the client sent
    return sendAndRespond(
        res,
        session.sessionId,
        "fldinfo",
        { json, player, device, uuuid, lastshot, u, whosturn, myfld, mysc, bns, rating },
        ctx
    )
}

/**
 * Increments move count for the player.
 *
 * @param {BigInt} baseSessionId - Base session ID
 * @param {number} player - Player number (0 or 1)
 * @param {Object} ctx - Logging context
 * @returns {Promise<void>}
 */
async function incrementMoveCount(baseSessionId, player, ctx) {
    const moveColumn = player === 0 ? "moves_one" : "moves_two"
    try {
        await pool.execute(
            `UPDATE game_sessions SET ${moveColumn} = ${moveColumn} + 1, updated_at = NOW(3)
             WHERE id = ?`,
            [baseSessionId.toString()]
        )
        logger.debug({ ...ctx, player }, "Move count incremented")
    } catch (error) {
        logger.error(ctx, "incrementMoveCount error:", error.message)
    }
}

/**
 * Shoot endpoint - fires a shot at opponent.
 * Client sends: { sid, cx, cy, time }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function shoot(req, res) {
    const { sid, cx, cy, time } = req.body
    const ctx = { reqId: req.requestId, sid, cx, cy }

    logger.debug(ctx, "Shoot request")

    if (cx === undefined || cy === undefined) {
        logger.warn(ctx, "Shoot missing coordinates")
        return res.json({ type: "error", reason: "Invalid shoot request" })
    }

    const session = validateSession(sid, res, ctx)
    if (!session) return

    await incrementMoveCount(session.baseSessionId, session.player, ctx)

    return sendAndRespond(res, session.sessionId, "shoot", { cx, cy, time }, ctx)
}

/**
 * Your turn endpoint - passes turn to opponent.
 * Client sends: { sid, time }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function yourTurn(req, res) {
    const { sid, time } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Your turn request")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    return sendAndRespond(res, session.sessionId, "yourturn", { time }, ctx)
}

/**
 * Info endpoint - sends info message.
 * Client sends: { sid, msg, u }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function info(req, res) {
    const { sid, msg, u } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Info request")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    return sendAndRespond(res, session.sessionId, "info", { msg, u }, ctx)
}

/**
 * Chat endpoint - sends chat message.
 * Client sends: { sid, msg, u }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function chat(req, res) {
    const { sid, msg, u } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Chat request")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    return sendAndRespond(res, session.sessionId, "chat", { msg, u }, ctx)
}

/**
 * Determines winner and loser IDs from session.
 *
 * @param {Object} gameSession - Session object from database
 * @param {number} player - Reporting player (0 or 1)
 * @param {boolean} won - Whether reporting player won
 * @returns {Object} Object with winnerId and loserId
 */
function determineWinnerLoser(gameSession, player, won) {
    const playerOneId = gameSession.user_one_id
    const playerTwoId = gameSession.user_two_id

    if (won) {
        return {
            winnerId: player === 0 ? playerOneId : playerTwoId,
            loserId: player === 0 ? playerTwoId : playerOneId,
        }
    }
    return {
        winnerId: player === 0 ? playerTwoId : playerOneId,
        loserId: player === 0 ? playerOneId : playerTwoId,
    }
}

/**
 * Updates winner's statistics.
 *
 * @param {Object} conn - Database connection
 * @param {number} winnerId - Winner user ID
 * @returns {Promise<void>}
 */
async function updateWinnerStats(conn, winnerId) {
    await conn.execute(
        `UPDATE users SET
            games = games + 1,
            gameswon = gameswon + 1,
            games_web = games_web + 1,
            wins_web = wins_web + 1,
            stars = stars + 1
         WHERE id = ?`,
        [winnerId]
    )
}

/**
 * Updates loser's statistics.
 *
 * @param {Object} conn - Database connection
 * @param {number} loserId - Loser user ID
 * @returns {Promise<void>}
 */
async function updateLoserStats(conn, loserId) {
    if (loserId) {
        await conn.execute(
            `UPDATE users SET
                games = games + 1,
                games_web = games_web + 1
             WHERE id = ?`,
            [loserId]
        )
    }
}

/**
 * Finish endpoint - finishes the game.
 * Client sends: { sid, won, u, sc, wpl, ni, gsi, sur }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function finish(req, res) {
    const { sid, won, u, sc, wpl, ni, gsi, sur } = req.body
    const ctx = { reqId: req.requestId, sid, won }

    logger.info(
        { ...ctx, sidType: typeof sid, body: JSON.stringify(req.body).substring(0, 500) },
        "Finish request received"
    )

    const session = validateSession(sid, res, ctx)
    if (!session) return

    const conn = await pool.getConnection()
    try {
        await conn.beginTransaction()

        const [sessions] = await conn.execute(
            "SELECT * FROM game_sessions WHERE id = ? FOR UPDATE",
            [session.baseSessionId.toString()]
        )

        if (sessions.length === 0) {
            await conn.rollback()
            logger.warn(ctx, "Session not found for finish")
            return res.json({
                type: "error",
                errcode: 5,
                reason: "Session not found",
            })
        }

        const gameSession = sessions[0]

        if (gameSession.status < 10) {
            const { winnerId, loserId } = determineWinnerLoser(
                gameSession,
                session.player,
                won
            )

            await conn.execute(
                `UPDATE game_sessions SET
                    status = 10,
                    winner_id = ?,
                    finished_at = NOW(3)
                 WHERE id = ?`,
                [winnerId, session.baseSessionId.toString()]
            )

            await updateWinnerStats(conn, winnerId)
            await updateLoserStats(conn, loserId)

            logger.info(
                { ...ctx, winnerId, loserId },
                `Game finished, winner: ${winnerId}`
            )
        } else {
            logger.debug(ctx, "Game already finished, skipping stats update")
        }

        await conn.commit()

        await sendMessage(session.sessionId, "fin", { won, u, sc, wpl, ni, gsi, sur })

        return res.json({ type: "ok" })
    } catch (error) {
        await conn.rollback()
        logger.error(ctx, "finish error:", error.message)
        return res.json({ type: "error", reason: "Server error" })
    } finally {
        conn.release()
    }
}

/**
 * Dutch move endpoint - Flying Dutchman ship move.
 * Client sends: { sid, ocx, ocy, ncx, ncy, or }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function dutchMove(req, res) {
    const { sid, ocx, ocy, ncx, ncy, or } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Dutch move request")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    return sendAndRespond(res, session.sessionId, "dutch", { ocx, ocy, ncx, ncy, or }, ctx)
}

/**
 * Ship move endpoint - submarine or ship move.
 * Client sends: { sid, ship }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function shipMove(req, res) {
    const { sid, ship } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Ship move request")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    return sendAndRespond(res, session.sessionId, "smove", { ship }, ctx)
}

module.exports = {
    greeting,
    fieldRequest,
    fieldInfo,
    shoot,
    yourTurn,
    info,
    chat,
    finish,
    dutchMove,
    shipMove,
    // Exported for testing
    validateSession,
    storeFieldData,
    determineWinnerLoser,
}
