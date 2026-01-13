/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("../../db/navalclash")
const { logger } = require("../../utils/logger")

const LIST_TYPE_FRIENDS = 1
const LIST_TYPE_BLOCKED = 2

/**
 * Serializes a rival object for API response.
 *
 * @param {Object} row - Database row
 * @returns {Object} Serialized rival
 */
function serializeRival(row) {
    return {
        id: row.rival_id || row.id,
        n: row.name,
        f: row.face,
        r: row.rank,
        s: row.stars,
        g: row.games,
        w: row.gameswon,
        uuid: row.uuid,
        st: row.status,
        ls: row.lastseen,
    }
}

/**
 * Serializes a user object for search results.
 *
 * @param {Object} row - Database row
 * @returns {Object} Serialized user
 */
function serializeSearchUser(row) {
    return {
        id: row.id,
        n: row.name,
        f: row.face,
        r: row.rank,
        s: row.stars,
        g: row.games,
        w: row.gameswon,
        uuid: row.uuid,
        st: row.status,
    }
}

/**
 * Add rival endpoint - adds rival to friends or blocked list.
 * Client sends: { u, rid, tp, var }
 * - u: current user PlayerInfo (contains id=uuid, nam=name)
 * - rid: rival user ID (numeric)
 * - tp: 1 (friends) or 2 (blocked)
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function addRival(req, res) {
    const { u, rid, tp } = req.body
    const ctx = { reqId: req.requestId, rid, tp }

    logger.debug(ctx, "Add rival request")

    if (!u || !rid) {
        logger.warn(ctx, "Add rival missing parameters")
        return res.json({ type: "error", reason: "Missing parameters" })
    }

    // Look up user by uuid and name
    const user = await findUserByInfo(u)
    if (!user) {
        logger.warn(ctx, "Add rival - user not found")
        return res.json({ type: "error", reason: "User not found" })
    }

    ctx.uid = user.id
    const listType = tp === LIST_TYPE_BLOCKED ? LIST_TYPE_BLOCKED : LIST_TYPE_FRIENDS

    try {
        await pool.execute(
            `INSERT INTO userlists (user_id, list_type, rival_id)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE list_type = VALUES(list_type)`,
            [user.id, listType, rid]
        )
        logger.info(ctx, `Rival added to ${listType === LIST_TYPE_BLOCKED ? "blocked" : "friends"} list`)
        return res.json({ type: "uok" })
    } catch (error) {
        logger.error(ctx, "addRival error:", error.message)
        return res.json({ type: "error", reason: "Database error" })
    }
}

/**
 * Delete rival endpoint - removes rival from list.
 * Client sends: { u, rid, tp, var }
 * - u: current user PlayerInfo (contains id=uuid, nam=name)
 * - rid: rival user ID (numeric)
 * - tp: 1 (friends) or 2 (blocked)
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function deleteRival(req, res) {
    const { u, rid, tp } = req.body
    const ctx = { reqId: req.requestId, rid, tp }

    logger.debug(ctx, "Delete rival request")

    if (!u || !rid) {
        logger.warn(ctx, "Delete rival missing parameters")
        return res.json({ type: "error", reason: "Missing parameters" })
    }

    // Look up user by uuid and name
    const user = await findUserByInfo(u)
    if (!user) {
        logger.warn(ctx, "Delete rival - user not found")
        return res.json({ type: "error", reason: "User not found" })
    }

    ctx.uid = user.id
    const listType = tp === LIST_TYPE_BLOCKED ? LIST_TYPE_BLOCKED : LIST_TYPE_FRIENDS

    try {
        await pool.execute(
            "DELETE FROM userlists WHERE user_id = ? AND rival_id = ? AND list_type = ?",
            [user.id, rid, listType]
        )
        logger.info(ctx, `Rival removed from ${listType === LIST_TYPE_BLOCKED ? "blocked" : "friends"} list`)
        return res.json({ type: "uok" })
    } catch (error) {
        logger.error(ctx, "deleteRival error:", error.message)
        return res.json({ type: "error", reason: "Database error" })
    }
}

/**
 * Get rivals endpoint - returns user's friends and blocked lists.
 * Client sends: { u, var }
 * - u: current user PlayerInfo (contains id=uuid, nam=name)
 * Response: { type: "usaved", ar: [...rivals] }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function getRivals(req, res) {
    const { u } = req.body
    const ctx = { reqId: req.requestId }

    logger.debug(ctx, "Get rivals request")

    if (!u) {
        logger.warn(ctx, "Get rivals missing user info")
        return res.json({ type: "error", reason: "Missing user info" })
    }

    // Look up user by uuid and name
    const user = await findUserByInfo(u)
    if (!user) {
        logger.warn(ctx, "Get rivals - user not found")
        return res.json({ type: "usaved", ar: [] })
    }

    ctx.uid = user.id

    try {
        const [rows] = await pool.execute(
            `SELECT ul.list_type, ul.rival_id,
                    u.id, u.name, u.face, u.rank, u.stars, u.games, u.gameswon,
                    u.uuid, u.status, u.updated_at as lastseen
             FROM userlists ul
             JOIN users u ON u.id = ul.rival_id
             WHERE ul.user_id = ?
             ORDER BY ul.list_type, u.name`,
            [user.id]
        )

        // Return all rivals with their list type
        const rivals = rows.map((row) => ({
            ...serializeRival(row),
            t: row.list_type, // 1=friends, 2=blocked
        }))

        logger.debug(ctx, `Returning ${rivals.length} rivals`)
        return res.json({ type: "usaved", ar: rivals })
    } catch (error) {
        logger.error(ctx, "getRivals error:", error.message)
        return res.json({ type: "error", reason: "Database error" })
    }
}

/**
 * Searches users by name with optional PIN.
 *
 * @param {string} name - Name to search
 * @param {number|null} pin - Optional PIN for exact match
 * @param {number} maxResults - Maximum results to return
 * @returns {Promise<Array>} Array of user rows
 */
async function searchUsersByName(name, pin, maxResults) {
    let query, params

    if (pin) {
        query = `SELECT id, name, face, \`rank\`, stars, games, gameswon, uuid, status
                 FROM users WHERE name = ? AND pin = ? LIMIT 1`
        params = [name, pin]
    } else {
        query = `SELECT id, name, face, \`rank\`, stars, games, gameswon, uuid, status
                 FROM users WHERE name LIKE ? ORDER BY games DESC LIMIT ?`
        params = [`%${name}%`, maxResults]
    }

    const [rows] = await pool.execute(query, params)
    return rows
}

/**
 * Search users endpoint - searches for users by name.
 * Client sends: { u, str, var }
 * - u: current user PlayerInfo
 * - str: search string (name to search for)
 * Response: { type: "ufound", ar: [...users] }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function searchUsers(req, res) {
    const { str, pin, limit } = req.body
    const ctx = { reqId: req.requestId, str, pin }

    logger.debug(ctx, "Search users request")

    if (!str) {
        logger.warn(ctx, "Search users missing search string")
        return res.json({ type: "error", reason: "Missing search string" })
    }

    const maxResults = Math.min(limit || 20, 50)

    try {
        const rows = await searchUsersByName(str, pin, maxResults)
        const users = rows.map(serializeSearchUser)
        logger.debug({ ...ctx, count: users.length }, "Search returned results")
        return res.json({ type: "ufound", ar: users })
    } catch (error) {
        logger.error(ctx, "searchUsers error:", error.message)
        return res.json({ type: "error", reason: "Database error" })
    }
}

/**
 * Get recent opponents endpoint - returns recent game opponents.
 * Client sends: { u, var }
 * - u: current user PlayerInfo (contains id=uuid, nam=name)
 * Response: { type: "urcnt", ar: [...opponents] }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function getRecentOpponents(req, res) {
    const { u, limit } = req.body
    const ctx = { reqId: req.requestId }

    logger.debug(ctx, "Get recent opponents request")

    if (!u) {
        logger.warn(ctx, "Get recent opponents missing user info")
        return res.json({ type: "error", reason: "Missing user info" })
    }

    // Look up user by uuid and name
    const user = await findUserByInfo(u)
    if (!user) {
        logger.warn(ctx, "Get recent opponents - user not found")
        return res.json({ type: "urcnt", ar: [] })
    }

    ctx.uid = user.id
    const maxResults = Math.min(limit || 20, 50)

    try {
        const [rows] = await pool.execute(
            `SELECT DISTINCT
                CASE WHEN gs.user_one_id = ? THEN gs.user_two_id ELSE gs.user_one_id END as rival_id,
                gs.winner_id,
                gs.created_at as played_at,
                u.id, u.name, u.face, u.rank, u.stars, u.games, u.gameswon, u.uuid, u.status,
                u.updated_at as lastseen
             FROM game_sessions gs
             JOIN users u ON u.id = CASE WHEN gs.user_one_id = ? THEN gs.user_two_id ELSE gs.user_one_id END
             WHERE (gs.user_one_id = ? OR gs.user_two_id = ?)
               AND gs.status >= 1
               AND gs.user_two_id IS NOT NULL
             ORDER BY gs.created_at DESC
             LIMIT ?`,
            [user.id, user.id, user.id, user.id, maxResults]
        )

        const opponents = rows.map((row) => ({
            ...serializeRival(row),
            won: row.winner_id === user.id ? 1 : 0,
            pa: row.played_at,
        }))

        logger.debug({ ...ctx, count: opponents.length }, "Returning recent opponents")
        return res.json({ type: "urcnt", ar: opponents })
    } catch (error) {
        logger.error(ctx, "getRecentOpponents error:", error.message)
        return res.json({ type: "error", reason: "Database error" })
    }
}

/**
 * Get online users endpoint - returns users currently waiting for games.
 * Client sends: { u, var }
 * - u: current user PlayerInfo (contains id=uuid, nam=name)
 * - var: game variant
 * Response: { type: "uair", ar: [...users] }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function getOnlineUsers(req, res) {
    const { u } = req.body
    const gameVariant = req.body.var || 1
    const ctx = { reqId: req.requestId, gameVariant }

    logger.debug(ctx, "Get online users request")

    // Look up user by uuid and name (optional - user might not exist yet)
    let userId = 0
    if (u) {
        const user = await findUserByInfo(u)
        if (user) {
            userId = user.id
            ctx.uid = userId
        }
    }

    try {
        const [rows] = await pool.execute(
            `SELECT * FROM v_waiting_users
             WHERE game_variant = ? AND user_id != ?
             ORDER BY updated_at DESC
             LIMIT 50`,
            [gameVariant, userId]
        )

        const users = rows.map((row) => ({
            id: row.user_id,
            n: row.name,
            f: row.face,
            r: row.rank,
            s: row.stars,
            g: row.games,
            w: row.gameswon,
            uuid: row.uuid,
            st: row.status,
            sid: row.session_id.toString(),
        }))

        logger.debug({ ...ctx, count: users.length }, "Returning online users")
        return res.json({ type: "uair", ar: users })
    } catch (error) {
        logger.error(ctx, "getOnlineUsers error:", error.message)
        return res.json({ type: "error", reason: "Database error" })
    }
}

// User status values for umarker
const USER_STATUS_IDLE = 0
const USER_STATUS_SETUP = 1
const USER_STATUS_PLAYING = 2

/**
 * Finds user by uuid and name from user info object.
 * Client sends: nam (name), id (uuid)
 *
 * @param {Object} userInfo - User info object from client (u field)
 * @returns {Promise<Object|null>} User object or null if not found
 */
async function findUserByInfo(userInfo) {
    if (!userInfo || !userInfo.id || !userInfo.nam) {
        return null
    }

    try {
        const [rows] = await pool.execute(
            "SELECT * FROM users WHERE uuid = ? AND name = ?",
            [userInfo.id, userInfo.nam]
        )
        return rows.length > 0 ? rows[0] : null
    } catch (error) {
        return null
    }
}

/**
 * Updates user status and last seen timestamp.
 *
 * @param {number} userId - User ID
 * @param {number} status - New status value
 * @param {number} version - Client version
 * @returns {Promise<boolean>} True if successful
 */
async function updateUserStatus(userId, status, version) {
    try {
        await pool.execute(
            `UPDATE users SET
                status = ?,
                version = COALESCE(?, version),
                updated_at = NOW(3)
             WHERE id = ?`,
            [status, version, userId]
        )
        return true
    } catch (error) {
        return false
    }
}

/**
 * Finds user by session ID (looks up from game_sessions table).
 *
 * @param {BigInt} sessionId - Session ID
 * @returns {Promise<Object|null>} User object or null if not found
 */
async function findUserBySession(sessionId) {
    try {
        const baseSessionId = sessionId & ~1n
        const player = Number(sessionId & 1n)

        const [sessions] = await pool.execute(
            "SELECT user_one_id, user_two_id FROM game_sessions WHERE id = ?",
            [baseSessionId.toString()]
        )

        if (sessions.length === 0) return null

        const userId = player === 0 ? sessions[0].user_one_id : sessions[0].user_two_id
        if (!userId) return null

        const [users] = await pool.execute("SELECT * FROM users WHERE id = ?", [userId])
        return users.length > 0 ? users[0] : null
    } catch (error) {
        return null
    }
}

/**
 * User marker endpoint - updates user presence/status.
 * Called periodically when player is in menus or setup screens.
 *
 * Client sends: { type, u, tp, var, pur, gsi, sid (optional) }
 * - u: user info object with uuid (id field), name (nam field), etc.
 * - tp: "edit" (setup screen) or "left" (leaving)
 * - var: game variant
 * - pur: profile update requested flag
 * - gsi: Google signed in flag
 * - sid: session ID (optional, for connected clients)
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function userMarker(req, res) {
    const { sid, tp, u, v } = req.body
    const gameVariant = req.body.var
    const ctx = { reqId: req.requestId, tp }

    logger.debug(ctx, "User marker request")

    // Try to find user - first by session ID (if provided), then by uuid + name
    let user = null
    if (sid) {
        ctx.sid = sid
        try {
            user = await findUserBySession(BigInt(sid))
        } catch (e) {
            // Invalid session ID format, try by user info
        }
    }

    if (!user) {
        user = await findUserByInfo(u)
    }

    if (!user) {
        // User hasn't connected yet - this is normal for first-time users
        // They'll be created during /connect, just return ok silently
        logger.debug(ctx, "User marker - user not found (will be created on connect)")
        return res.json({ type: "uok" })
    }

    ctx.uid = user.id

    try {
        // Determine new status based on tp field
        const newStatus = tp === "edit" ? USER_STATUS_SETUP : USER_STATUS_IDLE

        // Update user status and last seen
        await updateUserStatus(user.id, newStatus, v)
        logger.debug({ ...ctx, status: newStatus }, "User status updated")

        // If session ID provided, also update session heartbeat
        if (sid) {
            const sessionId = BigInt(sid)
            const baseSessionId = sessionId & ~1n

            if (tp === "left") {
                // Player leaving - close waiting session
                const [result] = await pool.execute(
                    `UPDATE game_sessions
                     SET status = 12, finished_at = NOW(3)
                     WHERE id = ? AND status = 0`,
                    [baseSessionId.toString()]
                )
                if (result.affectedRows > 0) {
                    logger.info(ctx, "Session closed (player left matchmaking)")
                }
            } else {
                // Keep session fresh
                await pool.execute(
                    `UPDATE game_sessions
                     SET updated_at = NOW(3)
                     WHERE id = ? AND status IN (0, 1)`,
                    [baseSessionId.toString()]
                )
            }
        }

        return res.json({ type: "uok" })
    } catch (error) {
        logger.error(ctx, "userMarker error:", error.message)
        return res.json({ type: "error", reason: "Server error" })
    }
}

module.exports = {
    addRival,
    deleteRival,
    getRivals,
    searchUsers,
    getRecentOpponents,
    getOnlineUsers,
    userMarker,
    // Exported for testing
    serializeRival,
    serializeSearchUser,
    searchUsersByName,
    LIST_TYPE_FRIENDS,
    LIST_TYPE_BLOCKED,
}
