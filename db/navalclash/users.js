/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("./pool")

/**
 * Finds a user by UUID and name.
 *
 * @param {string} uuid - Device UUID
 * @param {string} name - Player name
 * @returns {Promise<Object|null>} User object or null if not found
 */
async function dbFindUserByUuidAndName(uuid, name) {
    try {
        const [rows] = await pool.execute(
            "SELECT * FROM users WHERE uuid = ? AND name = ?",
            [uuid, name]
        )
        return rows.length > 0 ? rows[0] : null
    } catch (error) {
        console.error("dbFindUserByUuidAndName error:", error)
        return null
    }
}

/**
 * Finds a user by ID.
 *
 * @param {number} id - User ID
 * @returns {Promise<Object|null>} User object or null if not found
 */
async function dbFindUserById(id) {
    try {
        const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [
            id,
        ])
        return rows.length > 0 ? rows[0] : null
    } catch (error) {
        console.error("dbFindUserById error:", error)
        return null
    }
}

/**
 * Finds a user by UUID.
 *
 * @param {string} uuid - User UUID
 * @returns {Promise<Object|null>} User object or null if not found
 */
async function dbFindUserByUuid(uuid) {
    try {
        const [rows] = await pool.execute(
            "SELECT * FROM users WHERE uuid = ? LIMIT 1",
            [uuid]
        )
        return rows.length > 0 ? rows[0] : null
    } catch (error) {
        console.error("dbFindUserByUuid error:", error)
        return null
    }
}

/**
 * Creates a new user.
 *
 * @param {Object} userData - User data
 * @param {string} userData.name - Player name
 * @param {string} userData.uuid - Device UUID
 * @param {string} [userData.lang] - Language
 * @param {number} [userData.version] - App version
 * @param {number} [userData.gameVariant] - Game variant
 * @returns {Promise<number|null>} New user ID or null on error
 */
async function dbCreateUser(userData) {
    try {
        const [result] = await pool.execute(
            `INSERT INTO users (name, uuid, lang, version, last_game_variant, logins)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [
                userData.name,
                userData.uuid,
                userData.lang || null,
                userData.version || 0,
                userData.gameVariant || 1,
            ]
        )
        return result.insertId
    } catch (error) {
        console.error("dbCreateUser error:", error)
        return null
    }
}

/**
 * Updates user login info.
 *
 * @param {number} userId - User ID
 * @param {number} version - App version
 * @param {number} gameVariant - Game variant
 * @returns {Promise<boolean>} True if updated successfully
 */
async function dbUpdateUserLogin(userId, version, gameVariant) {
    try {
        await pool.execute(
            `UPDATE users SET
                logins = logins + 1,
                version = ?,
                last_game_variant = ?,
                updated_at = NOW()
             WHERE id = ?`,
            [version, gameVariant, userId]
        )
        return true
    } catch (error) {
        console.error("dbUpdateUserLogin error:", error)
        return false
    }
}

/**
 * Updates user's PIN.
 *
 * @param {number} userId - User ID
 * @param {number} pin - New PIN
 * @returns {Promise<boolean>} True if updated successfully
 */
async function dbUpdateUserPin(userId, pin) {
    try {
        await pool.execute("UPDATE users SET pin = ? WHERE id = ?", [
            pin,
            userId,
        ])
        return true
    } catch (error) {
        console.error("dbUpdateUserPin error:", error)
        return false
    }
}

/**
 * Checks if a PIN is already used by another user with the same name.
 *
 * @param {string} name - Player name
 * @param {number} pin - PIN to check
 * @param {number} excludeUserId - User ID to exclude from check
 * @returns {Promise<boolean>} True if PIN is already taken
 */
async function dbIsPinTaken(name, pin, excludeUserId) {
    try {
        const [rows] = await pool.execute(
            "SELECT id FROM users WHERE name = ? AND pin = ? AND id != ?",
            [name, pin, excludeUserId]
        )
        return rows.length > 0
    } catch (error) {
        console.error("dbIsPinTaken error:", error)
        return true // Assume taken on error to be safe
    }
}

/**
 * Finds a user by name and PIN (for profile import).
 *
 * @param {string} name - Player name
 * @param {number} pin - Profile recovery PIN
 * @returns {Promise<Object|null>} User object or null if not found
 */
async function dbFindUserByNameAndPin(name, pin) {
    try {
        const [rows] = await pool.execute(
            "SELECT * FROM users WHERE name = ? AND pin = ? AND id != 0",
            [name, pin]
        )
        return rows.length > 0 ? rows[0] : null
    } catch (error) {
        console.error("dbFindUserByNameAndPin error:", error)
        return null
    }
}

/**
 * Updates user profile data from export request.
 * Updates stats, face, language, timezone, and coins from client data.
 *
 * @param {Object} conn - Database connection
 * @param {number} userId - User ID
 * @param {Object} userData - Client's PlayerInfo object
 * @returns {Promise<boolean>} True if updated successfully
 */
async function dbUpdateUserProfile(conn, userId, userData) {
    try {
        await conn.execute(
            `UPDATE users SET
                face = COALESCE(?, face),
                lang = COALESCE(?, lang),
                tz = COALESCE(?, tz),
                coins = COALESCE(?, coins),
                updated_at = NOW()
             WHERE id = ?`,
            [
                userData.fc ?? null,
                userData.l ?? null,
                userData.tz ?? null,
                userData.an ?? null,
                userId,
            ]
        )
        return true
    } catch (error) {
        console.error("dbUpdateUserProfile error:", error)
        return false
    }
}

/**
 * Logs a profile action (export/import) for audit purposes.
 *
 * @param {number} userId - User ID
 * @param {string} action - Action type ('export' or 'import')
 * @param {string} details - Additional details
 * @returns {Promise<boolean>} True if logged successfully
 */
async function dbLogProfileAction(userId, action, details) {
    try {
        await pool.execute(
            `INSERT INTO profile_logs (user_id, action, details, created_at)
             VALUES (?, ?, ?, NOW())`,
            [userId, action, details]
        )
        return true
    } catch (error) {
        // Log table might not exist, just log to console
        console.log(`Profile action: user=${userId} action=${action} ${details}`)
        return false
    }
}

/**
 * Updates user's last device ID.
 *
 * @param {number} userId - User ID
 * @param {number} deviceId - Device ID
 * @returns {Promise<boolean>} True if updated successfully
 */
async function dbUpdateUserLastDevice(userId, deviceId) {
    try {
        await pool.execute("UPDATE users SET last_device_id = ? WHERE id = ?", [
            deviceId,
            userId,
        ])
        return true
    } catch (error) {
        console.error("dbUpdateUserLastDevice error:", error)
        return false
    }
}

/**
 * Updates non-web game stats from client data.
 * The server only tracks web games - android, bluetooth, and passplay stats
 * are tracked locally on the device and synced via this function.
 *
 * Client sends stats in ga[] and wa[] arrays:
 * - ga[0]/wa[0]: android games/wins
 * - ga[1]/wa[1]: bluetooth games/wins
 * - ga[2]/wa[2]: web games/wins (IGNORED - server is authoritative)
 * - ga[3]/wa[3]: passplay games/wins
 *
 * @param {Object} conn - Database connection (or pool)
 * @param {number} userId - User ID
 * @param {Object} clientUser - Client's PlayerInfo object with ga/wa arrays
 * @returns {Promise<boolean>} True if updated successfully
 */
async function dbUpdateLocalStats(conn, userId, clientUser) {
    if (!clientUser || !Array.isArray(clientUser.ga) || !Array.isArray(clientUser.wa)) {
        return false
    }

    const db = conn || pool
    const ga = clientUser.ga
    const wa = clientUser.wa

    // Extract non-web stats (indices 0, 1, 3 - skip index 2 which is web)
    const gamesAndroid = ga[0] || 0
    const gamesBluetooth = ga[1] || 0
    const gamesPassplay = ga[3] || 0
    const winsAndroid = wa[0] || 0
    const winsBluetooth = wa[1] || 0
    const winsPassplay = wa[3] || 0

    try {
        // Update non-web stats and recalculate totals
        // Total = android + bluetooth + web (from server) + passplay
        await db.execute(
            `UPDATE users SET
                games_android = ?,
                games_bluetooth = ?,
                games_passplay = ?,
                wins_android = ?,
                wins_bluetooth = ?,
                wins_passplay = ?,
                games = ? + ? + games_web + ?,
                gameswon = ? + ? + wins_web + ?
             WHERE id = ?`,
            [
                gamesAndroid,
                gamesBluetooth,
                gamesPassplay,
                winsAndroid,
                winsBluetooth,
                winsPassplay,
                gamesAndroid,
                gamesBluetooth,
                gamesPassplay,
                winsAndroid,
                winsBluetooth,
                winsPassplay,
                userId,
            ]
        )
        return true
    } catch (error) {
        console.error("dbUpdateLocalStats error:", error)
        return false
    }
}

module.exports = {
    dbFindUserByUuidAndName,
    dbFindUserById,
    dbFindUserByUuid,
    dbCreateUser,
    dbUpdateUserLogin,
    dbUpdateUserPin,
    dbIsPinTaken,
    dbFindUserByNameAndPin,
    dbUpdateUserProfile,
    dbLogProfileAction,
    dbUpdateUserLastDevice,
    dbUpdateLocalStats,
}
