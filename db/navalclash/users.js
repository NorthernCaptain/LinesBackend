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

module.exports = {
    dbFindUserByUuidAndName,
    dbFindUserById,
    dbCreateUser,
    dbUpdateUserLogin,
    dbUpdateUserPin,
    dbIsPinTaken,
    dbUpdateUserLastDevice,
}
