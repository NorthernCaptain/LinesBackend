/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool, dbUpdateLocalStats } = require("../../db/navalclash")
const { logger } = require("../../utils/logger")
const { buildMdfMessage } = require("./gameService")
const { sendMessage } = require("./messageService")
const { MSG, LIST_TYPE, RIVAL_TYPE, USER_STATUS } = require("./constants")

/**
 * Serializes a rival object for API response.
 *
 * @param {Object} row - Database row
 * @returns {Object} Serialized rival
 */
/**
 * Serializes a rival/user for client consumption.
 * Must match RivalInfo.deserializeJSON expected format.
 *
 * @param {Object} row - Database row
 * @returns {Object} Serialized rival in client format
 */
function serializeRival(row) {
    // Calculate elapsed time since last seen (in seconds)
    // Client expects seconds ago, not a timestamp
    let lastSeenSecondsAgo = 0
    if (row.lastseen || row.updated_at) {
        const date = row.lastseen || row.updated_at
        const lastSeenTime = new Date(date).getTime()
        const now = Date.now()
        lastSeenSecondsAgo = Math.max(0, Math.floor((now - lastSeenTime) / 1000))
    }

    return {
        type: "rnf",                    // Required - client checks this first!
        id: row.id,                     // User's database ID
        rid: row.rival_id || row.id,    // Rival ID for list operations
        n: row.name,                    // Name
        r: row.rank || 0,               // Rank
        l: row.lang || "--",            // Language
        g: row.games || 0,              // Games played
        gw: row.gameswon || 0,          // Games won
        d: row.device || "",            // Device name
        v: row.version || 0,            // Version
        f: row.face || 0,               // Face/avatar
        s: lastSeenSecondsAgo,          // Last seen (seconds ago)
        uid: row.uuid || "",            // UUID
    }
}

/**
 * Serializes a user object for search results.
 * Uses serializeRival with TYPE_SEARCH.
 *
 * @param {Object} row - Database row
 * @returns {Object} Serialized user
 */
function serializeSearchUser(row) {
    return {
        ...serializeRival(row),
        t: RIVAL_TYPE.SEARCH,
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

    // Look up user by uuuid (preferred) or legacy u.id
    const user = await findUserFromRequest(req.body)
    if (!user) {
        logger.warn(ctx, "Add rival - user not found")
        return res.json({ type: "error", reason: "User not found" })
    }

    ctx.uid = user.id
    const listType = tp === LIST_TYPE.BLOCKED ? LIST_TYPE.BLOCKED : LIST_TYPE.FRIENDS

    try {
        await pool.execute(
            `INSERT INTO userlists (user_id, list_type, rival_id)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE list_type = VALUES(list_type)`,
            [user.id, listType, rid]
        )
        logger.info(ctx, `Rival added to ${listType === LIST_TYPE.BLOCKED ? "blocked" : "friends"} list`)
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

    // Look up user by uuuid (preferred) or legacy u.id
    const user = await findUserFromRequest(req.body)
    if (!user) {
        logger.warn(ctx, "Delete rival - user not found")
        return res.json({ type: "error", reason: "User not found" })
    }

    ctx.uid = user.id
    const listType = tp === LIST_TYPE.BLOCKED ? LIST_TYPE.BLOCKED : LIST_TYPE.FRIENDS

    try {
        await pool.execute(
            "DELETE FROM userlists WHERE user_id = ? AND rival_id = ? AND list_type = ?",
            [user.id, rid, listType]
        )
        logger.info(ctx, `Rival removed from ${listType === LIST_TYPE.BLOCKED ? "blocked" : "friends"} list`)
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

    // Look up user by uuuid (preferred) or legacy u.id
    const user = await findUserFromRequest(req.body)
    if (!user) {
        logger.warn(ctx, "Get rivals - user not found")
        return res.json({ type: "usaved", ar: [] })
    }

    ctx.uid = user.id

    try {
        const [rows] = await pool.execute(
            `SELECT ul.list_type, ul.rival_id,
                    u.id, u.name, u.face, u.rank, u.stars, u.games, u.gameswon,
                    u.uuid, u.status, u.lang, u.version, u.updated_at as lastseen
             FROM userlists ul
             JOIN users u ON u.id = ul.rival_id
             WHERE ul.user_id = ?
             ORDER BY ul.list_type, u.name`,
            [user.id]
        )

        // Return all rivals with their type (mapped to client constants)
        const rivals = rows.map((row) => ({
            ...serializeRival(row),
            // Map list_type (1=friends, 2=blocked) to RivalInfo type (3=saved, 4=rejected)
            t: row.list_type === LIST_TYPE.FRIENDS ? RIVAL_TYPE.SAVED : RIVAL_TYPE.REJECTED,
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
        query = `SELECT id, name, face, \`rank\`, stars, games, gameswon, uuid, status, lang, version
                 FROM users WHERE name = ? AND pin = ? LIMIT 1`
        params = [name, pin]
    } else {
        // Use template literal for LIMIT since execute() has issues with LIMIT parameters
        // maxResults is already validated by caller using Math.min()
        query = `SELECT id, name, face, \`rank\`, stars, games, gameswon, uuid, status, lang, version
                 FROM users WHERE name LIKE ? ORDER BY games DESC LIMIT ${maxResults}`
        params = [`%${name}%`]
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

    // Look up user by uuuid (preferred) or legacy u.id
    const user = await findUserFromRequest(req.body)
    if (!user) {
        logger.warn(ctx, "Get recent opponents - user not found")
        return res.json({ type: "urcnt", ar: [] })
    }

    ctx.uid = user.id
    const maxResults = Math.min(limit || 20, 50)

    try {
        // Game history - show all games with opponent info (same opponent can appear multiple times)
        // LIMIT is embedded in SQL since execute() has issues with LIMIT parameters
        const [rows] = await pool.execute(
            `SELECT
                CASE WHEN gs.user_one_id = ? THEN gs.user_two_id ELSE gs.user_one_id END as rival_id,
                gs.winner_id,
                gs.created_at as played_at,
                u.id, u.name, u.face, u.rank, u.stars, u.games, u.gameswon, u.uuid, u.status,
                u.lang, u.version, u.updated_at as lastseen
             FROM game_sessions gs
             JOIN users u ON u.id = CASE WHEN gs.user_one_id = ? THEN gs.user_two_id ELSE gs.user_one_id END
             WHERE (gs.user_one_id = ? OR gs.user_two_id = ?)
               AND gs.status >= 1
               AND gs.user_two_id IS NOT NULL
             ORDER BY gs.created_at DESC
             LIMIT ${maxResults}`,
            [user.id, user.id, user.id, user.id]
        )

        const opponents = rows.map((row) => ({
            ...serializeRival(row),
            t: RIVAL_TYPE.RECENT,                           // Type = recent opponent
            iw: row.winner_id === user.id ? 1 : 0,              // I won flag
            gp: Math.floor(new Date(row.played_at).getTime() / 1000),  // Game played time (seconds)
        }))

        logger.debug({ ...ctx, count: opponents.length }, "Returning recent opponents")
        return res.json({ type: "urcnt", ar: opponents })
    } catch (error) {
        logger.error(ctx, "getRecentOpponents error:", error.message)
        return res.json({ type: "error", reason: "Database error" })
    }
}

/**
 * Get online users endpoint - returns users currently online (waiting + playing).
 * Client sends: { u, var }
 * - u: current user PlayerInfo (contains id=uuid, nam=name)
 * - var: game variant
 * Response: { type: "uair", ar: [...users] }
 *
 * Users are returned with special last_seen values:
 * - -1: Currently playing
 * - -2: Setting up ships
 * - >0: Seconds since last seen
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

    // Look up user by uuuid or legacy u.id (optional - user might not exist yet)
    let userId = 0
    if (u) {
        const user = await findUserFromRequest(req.body)
        if (user) {
            userId = user.id
            ctx.uid = userId
        }
    }

    try {
        const [rows] = await pool.execute(
            `SELECT * FROM v_online_users
             WHERE game_variant = ? AND user_id != ?
             ORDER BY is_playing ASC, updated_at DESC
             LIMIT 50`,
            [gameVariant, userId]
        )

        const users = rows.map((row) => ({
            type: "rnf",
            id: row.user_id,
            rid: row.user_id,
            n: row.name,
            r: row.rank || 0,
            l: row.lang || "--",
            g: row.games || 0,
            gw: row.gameswon || 0,
            d: "",
            v: row.version || 0,
            f: row.face || 0,
            s: row.last_seen,                               // -1=playing, -2=setup, >0=seconds ago
            uid: row.uuid || "",
            sid: row.is_playing ? null : row.session_id.toString(),  // Session ID only for waiting users
            ip: row.is_playing,                             // Is playing flag
        }))

        logger.debug({ ...ctx, count: users.length }, "Returning online users")
        return res.json({ type: "uair", ar: users })
    } catch (error) {
        logger.error(ctx, "getOnlineUsers error:", error.message)
        return res.json({ type: "error", reason: "Database error" })
    }
}


/**
 * Checks if someone is waiting to play with a specific user (personal game invitation).
 * Returns the waiting session info if found, or null if no pending invitation.
 *
 * @param {number} userId - The user ID to check for pending invitations
 * @param {number} gameVariant - Game variant to filter by
 * @returns {Promise<Object|null>} Session and inviter info, or null if none found
 */
async function findPendingInvitation(userId, gameVariant) {
    try {
        const [rows] = await pool.execute(
            `SELECT gs.id as session_id, gs.user_one_id,
                    u.id, u.name, u.uuid, u.face, u.rank, u.stars, u.games, u.gameswon, u.lang
             FROM game_sessions gs
             JOIN users u ON u.id = gs.user_one_id
             WHERE gs.target_rival_id = ?
               AND gs.game_variant = ?
               AND gs.status = 0
               AND gs.user_two_id IS NULL
               AND gs.updated_at > DATE_SUB(NOW(3), INTERVAL 2 MINUTE)
             ORDER BY gs.created_at ASC
             LIMIT 1`,
            [userId, gameVariant]
        )

        if (rows.length === 0) return null

        const row = rows[0]
        return {
            sessionId: row.session_id,
            inviter: {
                id: row.id,
                name: row.name,
                uuid: row.uuid,
                face: row.face,
                rank: row.rank,
                stars: row.stars,
                games: row.games,
                gameswon: row.gameswon,
                lang: row.lang,
            },
        }
    } catch (error) {
        logger.error({}, "findPendingInvitation error:", error.message)
        return null
    }
}

/**
 * Finds user by uuuid (generated UUID from UserIdentity) and name.
 * This is the preferred lookup method as uuuid is stable across reinstalls
 * when signed into Google Games.
 *
 * @param {string} uuuid - User UUID from UserIdentity.generateUserUuid()
 * @param {string} name - Player name
 * @returns {Promise<Object|null>} User object or null if not found
 */
async function findUserByUuuid(uuuid, name) {
    if (!uuuid || !name) {
        return null
    }

    try {
        const [rows] = await pool.execute(
            "SELECT * FROM users WHERE uuid = ? AND name = ?",
            [uuuid, name]
        )
        return rows.length > 0 ? rows[0] : null
    } catch (error) {
        return null
    }
}

/**
 * Finds user by uuid and name from user info object.
 * Client sends: nam (name), id (uuid)
 * Note: This uses the legacy u.id field which may differ from uuuid.
 * Prefer findUserByUuuid when uuuid is available.
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
 * Finds user from request body, trying uuuid first (preferred) then falling back to u.id.
 * This handles both new clients (sending uuuid) and legacy clients (only u.id).
 *
 * @param {Object} body - Request body containing u (user info) and optionally uuuid
 * @returns {Promise<Object|null>} User object or null if not found
 */
async function findUserFromRequest(body) {
    const { u, uuuid } = body

    // Prefer uuuid (from UserIdentity) over legacy u.id
    if (uuuid && u?.nam) {
        const user = await findUserByUuuid(uuuid, u.nam)
        if (user) return user
    }

    // Fallback to legacy u.id for older clients
    return await findUserByInfo(u)
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
    const { sid, tp, u, v, pur } = req.body
    const gameVariant = req.body.var || 1
    const ctx = { reqId: req.requestId, tp, pur: !!pur, var: gameVariant }

    logger.debug(ctx, "User marker request")

    // Try to find user - first by session ID, then by uuuid/u.id
    let user = null
    if (sid) {
        ctx.sid = sid
        try {
            user = await findUserBySession(BigInt(sid))
        } catch (e) {
            // Invalid session ID format, try other methods
        }
    }

    // Look up by uuuid (preferred) or legacy u.id
    if (!user) {
        user = await findUserFromRequest(req.body)
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
        const newStatus = tp === "edit" ? USER_STATUS.SETUP : USER_STATUS.IDLE

        // Update user status and last seen
        await updateUserStatus(user.id, newStatus, v)
        logger.debug({ ...ctx, status: newStatus }, "User status updated")

        // Check for pending personal game invitations
        // Only check if user is not already in a session (no sid provided)
        if (!sid && !user.isbanned) {
            const invitation = await findPendingInvitation(user.id, gameVariant)
            if (invitation) {
                logger.info(
                    { ...ctx, inviterId: invitation.inviter.id, inviterSid: invitation.sessionId },
                    `Found pending invitation from ${invitation.inviter.name}`
                )

                // Return uask response with invitation details
                return res.json({
                    type: "uask",
                    usid: invitation.sessionId.toString(),
                    u: {
                        nam: invitation.inviter.name,
                        i: invitation.inviter.id,
                        id: invitation.inviter.uuid || "",
                        rk: invitation.inviter.rank || 0,
                        st: invitation.inviter.stars || 0,
                        pld: invitation.inviter.games || 0,
                        won: invitation.inviter.gameswon || 0,
                        fc: invitation.inviter.face || 0,
                        l: invitation.inviter.lang || "en",
                    },
                    msg: {
                        type: "msg",
                        m: MSG.PERSONAL_RIVAL_REQUEST,
                        p: [invitation.inviter.name],
                        c: true, // needConfirm = true
                    },
                })
            }
        }

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

        // If profile update requested, embed mdf with full user data
        if (pur) {
            const conn = await pool.getConnection()
            try {
                // First, update non-web stats from client (android, bt, passplay)
                // Server only tracks web games - other stats come from client
                if (u) {
                    const updated = await dbUpdateLocalStats(conn, user.id, u)
                    if (updated) {
                        logger.debug(ctx, "Synced local game stats from client")
                    }
                }

                const mdf = await buildMdfMessage(conn, user.id, v, ctx)
                if (mdf) {
                    logger.debug(
                        { ...ctx, we: mdf.u?.we, coins: mdf.u?.an },
                        "Returning uok with embedded mdf"
                    )
                    return res.json({ type: "uok", mdf })
                }
            } finally {
                conn.release()
            }
        }

        return res.json({ type: "uok" })
    } catch (error) {
        logger.error(ctx, "userMarker error:", error.message)
        return res.json({ type: "error", reason: "Server error" })
    }
}

/**
 * User answer endpoint - responds to a battle invitation.
 * Called when a player accepts or rejects a personal rival game invitation.
 *
 * Client sends: { type: "uanswer", u, ans, usid, var }
 * - u: current user PlayerInfo (player responding to invitation)
 * - ans: boolean - true if accepted, false if rejected
 * - usid: session ID of the player who sent the invitation
 * - var: game variant
 *
 * Response: { type: "uok" } or banned message if user is banned
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function userAnswer(req, res) {
    const { u, ans, usid } = req.body
    const ctx = { reqId: req.requestId, usid, ans }

    logger.info(ctx, `Battle invitation ${ans ? "accepted" : "rejected"}`)

    if (!u || usid === undefined) {
        logger.warn(ctx, "User answer missing parameters")
        return res.json({ type: "error", reason: "Missing parameters" })
    }

    // Find the user responding to the invitation
    const user = await findUserFromRequest(req.body)
    if (!user) {
        logger.warn(ctx, "User answer - user not found")
        return res.json({ type: "error", reason: "User not found" })
    }

    ctx.uid = user.id

    // Check if user is banned
    if (user.isbanned) {
        logger.warn(ctx, "User is banned, refusing answer")
        return res.json({
            type: "banned",
            msg: {
                type: "msg",
                m: 9, // MSG_USER_BANNED
                p: [],
                c: true, // needConfirm = true
            },
            errcode: 1,
        })
    }

    try {
        // Convert usid to BigInt for session operations
        const inviterSessionId = BigInt(usid)

        // Verify the session exists and is waiting
        const baseSessionId = inviterSessionId & ~1n
        const [sessions] = await pool.execute(
            "SELECT id, status, user_one_id FROM game_sessions WHERE id = ?",
            [baseSessionId.toString()]
        )

        if (sessions.length === 0) {
            logger.warn(ctx, "Invitation session not found")
            return res.json({ type: "uok" }) // Still return ok, invitation may have expired
        }

        const session = sessions[0]

        // Build the info message to send to the inviter
        // Format: { type: "msg", m: <msgId>, p: [<params>], c: <needConfirm> }
        const msgId = ans ? MSG.PERSONAL_RIVAL_ACCEPTED : MSG.PERSONAL_RIVAL_REJECTED
        const infoMessage = {
            type: "msg",
            m: msgId,
            p: [user.name], // Include responder's name as parameter
            c: false,
        }

        // Serialize user info for the message
        const userInfo = {
            nam: user.name,
            i: user.id,
            rk: user.rank || 0,
            fc: user.face || 0,
            id: user.uuid || "",
        }

        // Send notification to the inviter
        await sendMessage(inviterSessionId, "info", {
            msg: infoMessage,
            u: userInfo,
        })

        logger.info(
            { ...ctx, inviterSid: inviterSessionId.toString() },
            `Sent ${ans ? "acceptance" : "rejection"} to inviter`
        )

        // If rejected, we could update the session status, but for now just notify
        // The inviter will handle the rejection on their end

        return res.json({ type: "uok" })
    } catch (error) {
        logger.error(ctx, "userAnswer error:", error.message)
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
    userAnswer,
    // Exported for testing
    serializeRival,
    serializeSearchUser,
    searchUsersByName,
    findPendingInvitation,
}
