/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("../../db/navalclash")
const { logger } = require("../../utils/logger")

/**
 * Snowflake-style Session ID Generator
 * Format (64 bits total, always even):
 *   [48 bits: timestamp ms] [10 bits: worker ID] [5 bits: sequence] [1 bit: 0 for even]
 *
 * - 48 bits timestamp: ~8900 years from epoch
 * - 10 bits worker: 0-1023 workers
 * - 5 bits sequence: 0-31 per ms per worker
 * - 1 bit always 0: ensures even number (player 0 = even, player 1 = odd)
 */
const WORKER_ID = parseInt(process.env.WORKER_ID || "0", 10) & 0x3ff
let lastTimestamp = 0n
let sequence = 0

/**
 * Generates a unique Snowflake-style session ID.
 *
 * @returns {BigInt} Unique session ID (always even)
 */
function generateSessionId() {
    let timestamp = BigInt(Date.now())

    if (timestamp === lastTimestamp) {
        sequence = (sequence + 1) & 0x1f
        if (sequence === 0) {
            while (timestamp === lastTimestamp) {
                timestamp = BigInt(Date.now())
            }
        }
    } else {
        sequence = 0
    }
    lastTimestamp = timestamp

    const id =
        (timestamp << 16n) |
        (BigInt(WORKER_ID) << 6n) |
        (BigInt(sequence) << 1n)

    return id
}

/**
 * Gets the base session ID by stripping the player bit.
 *
 * @param {BigInt|string} sessionId - Session ID
 * @returns {BigInt} Base session ID (even)
 */
function toBaseSessionId(sessionId) {
    return BigInt(sessionId) & ~1n
}

/**
 * Gets the player number from session ID.
 *
 * @param {BigInt|string} sessionId - Session ID
 * @returns {number} Player number (0 or 1)
 */
function getPlayer(sessionId) {
    return Number(BigInt(sessionId) & 1n)
}

/**
 * Serializes user object for API response.
 *
 * @param {Object} user - User object from database
 * @returns {Object} Serialized user data
 */
function serializeUser(user) {
    return {
        id: user.id,
        n: user.name,
        pin: user.pin,
        f: user.face,
        r: user.rank,
        s: user.stars,
        g: user.games,
        w: user.gameswon,
        c: user.coins,
    }
}

/**
 * Generates a unique PIN for a user.
 *
 * @param {Object} conn - Database connection
 * @param {string} name - Player name
 * @returns {Promise<number>} Unique PIN
 */
async function generateUniquePin(conn, name) {
    let pin
    let attempts = 0
    let maxPin = 9999

    while (attempts < 100) {
        pin = Math.floor(Math.random() * maxPin) + 1
        const [rows] = await conn.execute(
            "SELECT id FROM users WHERE name = ? AND pin = ?",
            [name, pin]
        )
        if (rows.length === 0) return pin

        attempts++
        if (attempts % 10 === 0) maxPin *= 10
    }
    return pin
}

/**
 * Finds existing user or creates a new one.
 *
 * @param {Object} conn - Database connection
 * @param {Object} body - Request body
 * @returns {Promise<Object>} User object
 */
async function getOrCreateUser(conn, body) {
    const ctx = { name: body.player, uuid: body.uuuid?.substring(0, 8) }

    let [rows] = await conn.execute(
        "SELECT * FROM users WHERE uuid = ? AND name = ?",
        [body.uuuid, body.player]
    )

    if (rows.length > 0) {
        const user = rows[0]
        logger.debug(
            { ...ctx, uid: user.id },
            `User found, updating login count to ${user.logins + 1}`
        )
        await conn.execute(
            `UPDATE users SET
                logins = logins + 1,
                version = ?,
                last_game_variant = ?,
                updated_at = NOW()
             WHERE id = ?`,
            [body.v || 0, body.var || 1, user.id]
        )
        user.logins++
        return user
    }

    logger.info(ctx, "Creating new user")
    const [result] = await conn.execute(
        `INSERT INTO users (name, uuid, version, lang, last_game_variant, logins)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [body.player, body.uuuid, body.v || 0, body.lang || null, body.var || 1]
    )

    const userId = result.insertId
    const pin = await generateUniquePin(conn, body.player)
    await conn.execute("UPDATE users SET pin = ? WHERE id = ?", [pin, userId])
    ;[rows] = await conn.execute("SELECT * FROM users WHERE id = ?", [userId])

    logger.info({ ...ctx, uid: userId, pin }, "New user created with PIN")
    return rows[0]
}

/**
 * Updates an existing device record.
 *
 * @param {Object} conn - Database connection
 * @param {number} deviceId - Device ID
 * @param {Object} body - Request body with device info
 * @returns {Promise<void>}
 */
async function updateDevice(conn, deviceId, body) {
    await conn.execute(
        `UPDATE devices SET
            model = COALESCE(?, model),
            manufacturer = COALESCE(?, manufacturer),
            os_version = COALESCE(?, os_version),
            app_version = ?,
            updated_at = NOW()
         WHERE id = ?`,
        [
            body.model || null,
            body.manufacturer || null,
            body.osVersion || null,
            body.v || 0,
            deviceId,
        ]
    )
}

/**
 * Creates a new device record.
 *
 * @param {Object} conn - Database connection
 * @param {Object} body - Request body with device info
 * @returns {Promise<number>} New device ID
 */
async function createDevice(conn, body) {
    const [result] = await conn.execute(
        `INSERT INTO devices
            (android_id, device, model, manufacturer, product, os_version,
             disp_dpi, disp_height, disp_width, disp_scale, disp_size, app_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            body.androidId,
            body.device || null,
            body.model || null,
            body.manufacturer || null,
            body.product || null,
            body.osVersion || null,
            body.dispDpi || null,
            body.dispHeight || null,
            body.dispWidth || null,
            body.dispScale || null,
            body.dispSize || null,
            body.v || 0,
        ]
    )
    return result.insertId
}

/**
 * Links a device to a user and updates last_device_id.
 *
 * @param {Object} conn - Database connection
 * @param {number} userId - User ID
 * @param {number} deviceId - Device ID
 * @returns {Promise<void>}
 */
async function linkDeviceToUser(conn, userId, deviceId) {
    await conn.execute(
        `INSERT INTO user_devices (user_id, device_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE last_used_at = NOW()`,
        [userId, deviceId]
    )
    await conn.execute("UPDATE users SET last_device_id = ? WHERE id = ?", [
        deviceId,
        userId,
    ])
}

/**
 * Gets or creates a device and links it to the user.
 *
 * @param {Object} conn - Database connection
 * @param {number} userId - User ID
 * @param {Object} body - Request body with device info
 * @returns {Promise<number>} Device ID
 */
async function getOrCreateDevice(conn, userId, body) {
    const androidId = body.androidId
    const ctx = { uid: userId, androidId: androidId?.substring(0, 8) }

    const [rows] = await conn.execute(
        "SELECT id FROM devices WHERE android_id = ?",
        [androidId]
    )

    let deviceId
    if (rows.length > 0) {
        deviceId = rows[0].id
        logger.debug({ ...ctx, did: deviceId }, "Device found, updating")
        await updateDevice(conn, deviceId, body)
    } else {
        deviceId = await createDevice(conn, body)
        logger.info({ ...ctx, did: deviceId }, "New device created")
    }

    await linkDeviceToUser(conn, userId, deviceId)
    logger.debug({ ...ctx, did: deviceId }, "Device linked to user")
    return deviceId
}

/**
 * Joins user to an existing waiting session.
 *
 * @param {Object} conn - Database connection
 * @param {Object} session - Waiting session
 * @param {number} userId - User ID
 * @param {number} version - App version
 * @returns {Promise<BigInt>} Session ID for player 1 (odd)
 */
async function joinExistingSession(conn, session, userId, version) {
    // session.id from DB could be string, number, or BigInt depending on mysql2 config
    // Convert to string for consistent handling with BIGINT columns
    const sessionIdStr = String(session.id)
    const sessionId = BigInt(sessionIdStr)
    const playerSessionId = sessionId + 1n

    logger.info(
        {
            sid: playerSessionId,
            uid: userId,
            opponentUid: session.user_one_id,
            baseSid: sessionIdStr,
        },
        `Joining existing session as player 1, opponent: ${session.user_one_name}`
    )

    // Use query() instead of execute() for BigInt - prepared statements can have issues
    // Also add user_two_id IS NULL check as extra safety
    const [result] = await conn.query(
        `UPDATE game_sessions SET
            user_two_id = ?,
            user_two_connected_at = NOW(3),
            version_two = ?,
            status = 1,
            updated_at = NOW(3)
         WHERE id = ? AND user_two_id IS NULL`,
        [userId, version, sessionIdStr]
    )

    if (result.affectedRows === 0) {
        logger.error(
            { sid: sessionIdStr, uid: userId, affected: result.affectedRows },
            "Failed to update session - no rows affected! Session may have been taken by another player."
        )
    } else {
        logger.debug(
            { sid: sessionIdStr, uid: userId, affected: result.affectedRows },
            "Session updated with player 2"
        )
    }

    return playerSessionId
}

/**
 * Creates a new waiting session.
 *
 * @param {Object} conn - Database connection
 * @param {number} userId - User ID
 * @param {number} version - App version
 * @param {number} gameVariant - Game variant
 * @returns {Promise<BigInt>} New session ID (even)
 */
async function createNewSession(conn, userId, version, gameVariant) {
    const sessionId = generateSessionId()
    const sessionIdStr = sessionId.toString()

    logger.info(
        { sid: sessionIdStr, uid: userId, variant: gameVariant },
        "Creating new waiting session as player 0"
    )

    // Use query() for BigInt - prepared statements can have issues with large integers
    await conn.query(
        `INSERT INTO game_sessions
            (id, user_one_id, user_one_connected_at, version_one, game_variant, status)
         VALUES (?, ?, NOW(3), ?, ?, 0)`,
        [sessionIdStr, userId, version, gameVariant]
    )

    return sessionId
}

/**
 * Acquires a matchmaking lock for the given game variant.
 * This prevents race conditions where two players connecting simultaneously
 * both create their own sessions instead of being matched together.
 *
 * @param {Object} conn - Database connection (must be in a transaction)
 * @param {number} gameVariant - Game variant to lock
 * @returns {Promise<void>}
 */
async function acquireMatchmakingLock(conn, gameVariant) {
    // This SELECT FOR UPDATE blocks until any other transaction
    // holding a lock on this variant's row releases it.
    // If the row doesn't exist, we insert it first (handles new variants).
    // await conn.execute(
    //     `INSERT INTO matchmaking_locks (game_variant) VALUES (?)
    //      ON DUPLICATE KEY UPDATE game_variant = game_variant`,
    //     [gameVariant]
    // )
    await conn.execute(
        "SELECT * FROM matchmaking_locks WHERE game_variant = ? FOR UPDATE",
        [gameVariant]
    )
}

/**
 * Finds a waiting session or creates a new one.
 *
 * @param {Object} conn - Database connection
 * @param {Object} user - User object
 * @param {Object} body - Request body
 * @returns {Promise<Object>} Object with sessionId and isNewSession flag
 */
async function findOrCreateSession(conn, user, body) {
    const gameVariant = body.var || 1
    const version = body.v || 0
    const hasRival = body.rival && body.rival.id
    const ctx = { uid: user.id, variant: gameVariant }

    if (hasRival) {
        logger.debug(
            { ...ctx, rivalId: body.rival.id },
            "Personal game requested, skipping matchmaking"
        )
    }

    if (!hasRival) {
        // Acquire matchmaking lock to prevent race conditions.
        // Without this, two players connecting simultaneously when no
        // waiting session exists would both create their own sessions.
        logger.debug(ctx, "Acquiring matchmaking lock")
        await acquireMatchmakingLock(conn, gameVariant)

        logger.debug(ctx, "Searching for waiting session")
        const [waitingSessions] = await conn.execute(
            `SELECT gs.*, u.name as user_one_name
             FROM game_sessions gs
             JOIN users u ON u.id = gs.user_one_id
             WHERE gs.status = 0
               AND gs.user_two_id IS NULL
               AND gs.user_one_id != ?
               AND gs.game_variant = ?
               AND gs.updated_at > DATE_SUB(NOW(3), INTERVAL 2 MINUTE)
             ORDER BY gs.created_at ASC
             LIMIT 1`,
            [user.id, gameVariant]
        )

        if (waitingSessions.length > 0) {
            logger.debug(
                { ...ctx, foundSid: waitingSessions[0].id },
                `Found ${waitingSessions.length} waiting session(s), joining first`
            )
            const sessionId = await joinExistingSession(
                conn,
                waitingSessions[0],
                user.id,
                version
            )
            return { sessionId, isNewSession: false }
        }
        logger.debug(ctx, "No waiting sessions found")
    }

    const sessionId = await createNewSession(
        conn,
        user.id,
        version,
        gameVariant
    )
    return { sessionId, isNewSession: true }
}

/**
 * Gets configuration value from database.
 *
 * @param {Object} conn - Database connection
 * @param {string} name - Config name
 * @returns {Promise<Object|null>} Config object or null
 */
async function getConfig(conn, name) {
    const [rows] = await conn.execute(
        "SELECT * FROM gamesetup WHERE name = ?",
        [name]
    )
    return rows[0] || null
}

/**
 * Session finish status code for duplicate connection.
 */
const SESSION_STATUS_TERMINATED_DUPLICATE = 7

/**
 * Terminates all active sessions for a user (when they reconnect).
 * Sets status to FINISHED_TERMINATED_DUPLICATE (7).
 *
 * @param {Object} conn - Database connection
 * @param {number} userId - User ID
 * @returns {Promise<number>} Number of sessions terminated
 */
async function terminateUserSessions(conn, userId) {
    const [result] = await conn.execute(
        `UPDATE game_sessions SET
            status = ?,
            finished_at = NOW(3)
         WHERE (user_one_id = ? OR user_two_id = ?)
           AND status <= 1`,
        [SESSION_STATUS_TERMINATED_DUPLICATE, userId, userId]
    )

    if (result.affectedRows > 0) {
        logger.info(
            { uid: userId, count: result.affectedRows },
            `Terminated ${result.affectedRows} active session(s) due to reconnect`
        )
    }
    return result.affectedRows
}

/**
 * Connect endpoint - registers user and finds/creates session.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function connect(req, res) {
    const body = req.body
    const reqCtx = { name: body.player, uuid: body.uuuid?.substring(0, 8) }

    logger.info(reqCtx, "Connect request received")

    if (!body.player || !body.uuuid || body.type !== "connect") {
        logger.warn(reqCtx, "Invalid connect request - missing required fields")
        return res.json({ type: "refused", reason: "Invalid connect request" })
    }

    const conn = await pool.getConnection()
    try {
        // Use READ COMMITTED so the session search sees newly committed sessions.
        // With default REPEATABLE READ, if our transaction starts before another
        // player commits their session, we won't see it even after acquiring
        // the matchmaking lock.
        await conn.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED")
        await conn.beginTransaction()

        const user = await getOrCreateUser(conn, body)
        const ctx = { ...reqCtx, uid: user.id }

        if (body.androidId) {
            await getOrCreateDevice(conn, user.id, body)
        }

        if (user.isbanned) {
            logger.warn(ctx, "User is banned, refusing connection")
            await conn.commit()
            return res.json({ type: "banned", reason: "User is banned" })
        }

        const maintenance = await getConfig(conn, "maintenance_mode")
        if (maintenance && maintenance.int_value) {
            logger.info(ctx, "Server in maintenance mode, refusing connection")
            await conn.commit()
            return res.json({
                type: "maintenance",
                reason: "Server maintenance",
            })
        }

        // Terminate any existing active sessions for this user
        await terminateUserSessions(conn, user.id)

        const { sessionId, isNewSession } = await findOrCreateSession(
            conn,
            user,
            body
        )

        await conn.commit()

        logger.info(
            { ...ctx, sid: sessionId, isNew: isNewSession },
            `Connect successful, session ${isNewSession ? "created" : "joined"}`
        )

        return res.json({
            type: "connected",
            sid: sessionId.toString(),
            u: serializeUser(user),
        })
    } catch (error) {
        await conn.rollback()
        logger.error(reqCtx, "Connect failed with error:", error.message)
        return res.json({ type: "refused", reason: "Server error" })
    } finally {
        conn.release()
    }
}

/**
 * Reconnect endpoint - reconnects to an existing session.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function reconnect(req, res) {
    const { sid } = req.body
    const ctx = { sid }

    logger.info(ctx, "Reconnect request received")

    if (!sid) {
        logger.warn({}, "Reconnect failed - no session ID provided")
        return res.json({ type: "refused", reason: "No session ID" })
    }

    try {
        const [rows] = await pool.execute(
            "SELECT * FROM game_sessions WHERE id = ? AND status < 10",
            [sid]
        )

        if (rows.length === 0) {
            logger.warn(ctx, "Reconnect failed - session not found or finished")
            return res.json({
                type: "refused",
                errcode: 5,
                reason: "Session not found",
            })
        }

        const session = rows[0]
        logger.info(
            {
                ...ctx,
                status: session.status,
                uid1: session.user_one_id,
                uid2: session.user_two_id,
            },
            "Reconnect successful"
        )

        return res.json({ type: "connected", sid: String(sid) })
    } catch (error) {
        logger.error(ctx, "Reconnect failed with error:", error.message)
        return res.json({ type: "refused", reason: "Server error" })
    }
}

module.exports = {
    connect,
    reconnect,
    generateSessionId,
    toBaseSessionId,
    getPlayer,
    serializeUser,
}
