/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const {
    pool,
    dbFindUserByUuidAndName,
    dbFindUserByUuid,
    dbFindUserByNameAndPin,
    dbCreateUser,
    dbSyncUserProfile,
    dbUpdateProfileAndStats,
    dbLogProfileAction,
    dbGetUserWeaponArrays,
} = require("../../db/navalclash")
const { logger } = require("../../utils/logger")

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
 * Serializes user object for export response.
 * Format matches the client's PlayerInfo serialization.
 *
 * @param {Object} user - User object from database
 * @param {{we: number[], wu: number[]}} weapons - Weapon inventory arrays
 * @returns {Object} Serialized user data for client
 */
function serializeUserForExport(user, weapons) {
    return {
        nam: user.name,
        dev: "",
        id: user.uuid || "",
        ut: 2,
        i: user.id,
        pin: user.pin,
        rk: user.rank || 0,
        st: user.stars || 0,
        won: user.gameswon || 0,
        pld: user.games || 0,
        fc: user.face || 0,
        an: user.coins || 0,
        l: user.lang || "en",
        tz: user.timezone || 0,
        ga: [
            user.games_android || 0,
            user.games_bluetooth || 0,
            user.games_web || 0,
            user.games_passplay || 0,
        ],
        wa: [
            user.wins_android || 0,
            user.wins_bluetooth || 0,
            user.wins_web || 0,
            user.wins_passplay || 0,
        ],
        we: weapons.we,
        wu: weapons.wu,
    }
}

/**
 * Merges client profile updates into a user object in-place.
 * Avoids a re-SELECT after UPDATE by applying known changes locally.
 *
 * @param {Object} user - User object from database
 * @param {Object} clientUser - Client's PlayerInfo object
 */
function mergeProfileUpdates(user, clientUser) {
    if (clientUser.fc != null) user.face = clientUser.fc
    if (clientUser.l != null) user.lang = clientUser.l
    if (clientUser.tz != null) user.timezone = clientUser.tz
    if (clientUser.rk != null) user.rank = clientUser.rk
    if (clientUser.st != null) user.stars = clientUser.st

    if (Array.isArray(clientUser.ga) && Array.isArray(clientUser.wa)) {
        user.games_android = clientUser.ga[0] || 0
        user.games_bluetooth = clientUser.ga[1] || 0
        user.games_passplay = clientUser.ga[3] || 0
        user.wins_android = clientUser.wa[0] || 0
        user.wins_bluetooth = clientUser.wa[1] || 0
        user.wins_passplay = clientUser.wa[3] || 0
        user.games =
            user.games_android +
            user.games_bluetooth +
            (user.games_web || 0) +
            user.games_passplay
        user.gameswon =
            user.wins_android +
            user.wins_bluetooth +
            (user.wins_web || 0) +
            user.wins_passplay
    }
}

/**
 * Creates a new user for export with PIN, inside a transaction.
 *
 * @param {Object} clientUser - Client's PlayerInfo object
 * @param {number} version - Client version
 * @returns {Promise<Object>} Created user object
 */
async function createExportUser(clientUser, version) {
    const conn = await pool.getConnection()
    try {
        await conn.beginTransaction()

        const pin = await generateUniquePin(conn, clientUser.nam)
        const [result] = await conn.execute(
            `INSERT INTO users (name, uuid, pin, face, lang, timezone,
                \`rank\`, stars, coins, version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            [
                clientUser.nam,
                clientUser.id || "",
                pin,
                clientUser.fc || 0,
                clientUser.l || "en",
                clientUser.tz || 0,
                clientUser.rk || 0,
                clientUser.st || 0,
                version || 0,
            ]
        )

        const [rows] = await conn.execute("SELECT * FROM users WHERE id = ?", [
            result.insertId,
        ])
        await conn.commit()
        return rows[0]
    } catch (error) {
        await conn.rollback()
        throw error
    } finally {
        conn.release()
    }
}

/**
 * Generates and saves a PIN for an existing user, inside a transaction.
 *
 * @param {Object} user - User object from database
 * @returns {Promise<number>} Generated PIN
 */
async function generateAndSavePin(user) {
    const conn = await pool.getConnection()
    try {
        await conn.beginTransaction()
        const pin = await generateUniquePin(conn, user.name)
        await conn.execute("UPDATE users SET pin = ? WHERE id = ?", [
            pin,
            user.id,
        ])
        await conn.commit()
        return pin
    } catch (error) {
        await conn.rollback()
        throw error
    } finally {
        conn.release()
    }
}

/**
 * Export profile endpoint handler.
 * Saves player data to server and returns a PIN for later recovery.
 *
 * Fast path (existing user with PIN): 2 DB queries, no transaction.
 * Slow path (new user or missing PIN): uses transaction for atomicity.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<void>}
 */
async function exportProfile(req, res) {
    const body = req.body
    const clientUser = body.u
    const ctx = { type: "export" }

    logger.info(ctx, "Export profile request received")

    if (!clientUser || !clientUser.nam || !clientUser.id) {
        logger.warn(ctx, "Invalid export request - missing user data")
        return res.json({ type: "error", reason: "Invalid request" })
    }

    ctx.name = clientUser.nam
    ctx.clientUid = clientUser.id

    try {
        let user = await dbFindUserByUuidAndName(clientUser.id, clientUser.nam)

        if (!user) {
            // New user - needs transaction for PIN + INSERT
            logger.info(ctx, "User not found by UUID, creating new profile")
            user = await createExportUser(clientUser, body.v)
            ctx.uid = user.id
            logger.info(
                { ...ctx, pin: user.pin },
                "New user created for export"
            )
        } else {
            ctx.uid = user.id

            // Generate PIN if missing (rare - needs transaction)
            if (!user.pin) {
                user.pin = await generateAndSavePin(user)
                logger.info(
                    { ...ctx, pin: user.pin },
                    "Generated new PIN for existing user"
                )
            }

            // Fast path: single UPDATE, no transaction needed
            await dbUpdateProfileAndStats(pool, user.id, clientUser)
            mergeProfileUpdates(user, clientUser)
            logger.info(ctx, "Updated existing user profile")
        }

        // Fetch weapon inventory for response
        const weapons = await dbGetUserWeaponArrays(user.id)

        // Log export action (fire and forget)
        dbLogProfileAction(
            user.id,
            "export",
            `device=${clientUser.dev || "unknown"}`
        )

        logger.info({ ...ctx, pin: user.pin }, "Export successful")

        return res.json({
            type: "uexpres",
            id: user.id,
            pin: user.pin,
            u: serializeUserForExport(user, weapons),
        })
    } catch (error) {
        logger.error(ctx, "Export failed:", error.message)
        return res.json({ type: "error", reason: "Server error" })
    }
}

/**
 * Import profile endpoint handler.
 * Retrieves player profile using name + PIN verification.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<void>}
 */
async function importProfile(req, res) {
    const body = req.body
    const name = body.name
    const pin = parseInt(body.pin, 10)
    const ctx = { type: "import", name }

    logger.info(ctx, "Import profile request received")

    if (!name || !pin || isNaN(pin)) {
        logger.warn(ctx, "Invalid import request - missing name or PIN")
        return res.json({ type: "uimpres" })
    }

    try {
        const user = await dbFindUserByNameAndPin(name, pin)

        if (!user) {
            logger.warn({ ...ctx, pin }, "Import failed - user not found")
            return res.json({ type: "uimpres" })
        }

        ctx.uid = user.id

        // Check if user is banned
        if (user.isbanned) {
            logger.warn(ctx, "Import failed - user is banned")
            return res.json({ type: "uimpres" })
        }

        // Fetch weapon inventory for response
        const weapons = await dbGetUserWeaponArrays(user.id)

        // Log the import action
        dbLogProfileAction(user.id, "import", `v=${body.v || 0}`)

        logger.info(ctx, "Import successful")

        return res.json({
            type: "uimpres",
            u: serializeUserForExport(user, weapons),
        })
    } catch (error) {
        logger.error(ctx, "Import failed:", error.message)
        return res.json({ type: "uimpres" })
    }
}

/**
 * Sync profile endpoint handler (UFV - User Field Version).
 * Updates user profile data and local game stats on the server.
 * Used for periodic profile synchronization.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<void>}
 */
async function syncProfile(req, res) {
    const body = req.body
    const clientUser = body.u
    const version = body.v || body.V || 0
    const ignoreErrors = body.ig === 1
    const ctx = { type: "ufv", v: version }

    logger.debug(ctx, "Profile sync request received")

    // Validate request
    if (!clientUser || !clientUser.id) {
        logger.debug(ctx, "Invalid sync request - missing user data")
        if (ignoreErrors) {
            return res.json({ type: "ok" })
        }
        return res.json({ type: "error", reason: "Invalid request" })
    }

    ctx.uuid = clientUser.id
    ctx.name = clientUser.nam

    try {
        // Find user by UUID + name first, then by UUID only
        let user = await dbFindUserByUuidAndName(clientUser.id, clientUser.nam)

        if (!user) {
            user = await dbFindUserByUuid(clientUser.id)
        }

        if (!user) {
            // User not found - create new user (like old Java server)
            logger.info(ctx, "User not found, creating new user for sync")
            const newUserId = await dbCreateUser({
                name: clientUser.nam || "Player",
                uuid: clientUser.id,
                gameVariant: body.var || 1,
            })

            if (!newUserId) {
                logger.error(ctx, "Failed to create user for sync")
                if (ignoreErrors) {
                    return res.json({ type: "ok" })
                }
                return res.json({
                    type: "error",
                    reason: "Failed to create user",
                })
            }

            ctx.uid = newUserId
            logger.info(ctx, "Created new user for profile sync")
        } else {
            ctx.uid = user.id
        }

        // Sync profile data
        const updated = await dbSyncUserProfile(ctx.uid, clientUser, version)
        if (updated) {
            logger.debug(ctx, "Profile synced successfully")
        }

        return res.json({ type: "ok" })
    } catch (error) {
        logger.error(ctx, "Profile sync failed:", error.message)
        if (ignoreErrors) {
            return res.json({ type: "ok" })
        }
        return res.json({ type: "error", reason: "Server error" })
    }
}

module.exports = {
    exportProfile,
    importProfile,
    syncProfile,
}
