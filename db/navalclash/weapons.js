/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("./pool")

/**
 * Gets user's weapon inventory.
 *
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Map of weaponId -> quantity
 */
async function dbGetUserWeaponInventory(userId) {
    try {
        const [rows] = await pool.execute(
            `SELECT item_id, quantity FROM user_inventory
             WHERE user_id = ? AND item_type = 'weapon'`,
            [userId]
        )
        const inventory = {}
        for (const row of rows) {
            inventory[row.item_id] = row.quantity
        }
        return inventory
    } catch (error) {
        console.error("dbGetUserWeaponInventory error:", error)
        return {}
    }
}

/**
 * Gets tracked weapons for a session player.
 *
 * @param {BigInt|string} sessionId - Base session ID
 * @param {number} player - Player number (0 or 1)
 * @returns {Promise<Object|null>} Tracked weapons JSON or null
 */
async function dbGetTrackedWeapons(sessionId, player) {
    try {
        const column =
            player === 0 ? "weapons_tracked_one" : "weapons_tracked_two"
        const [rows] = await pool.execute(
            `SELECT ${column} as tracked FROM game_sessions WHERE id = ?`,
            [sessionId.toString()]
        )
        if (rows.length === 0) {
            return null
        }
        return rows[0].tracked || {}
    } catch (error) {
        console.error("dbGetTrackedWeapons error:", error)
        return null
    }
}

/**
 * Sets tracked weapons for a session player.
 *
 * @param {BigInt|string} sessionId - Base session ID
 * @param {number} player - Player number (0 or 1)
 * @param {Object} weapons - Weapon counts { weaponId: count }
 * @param {Object} conn - Database connection (optional)
 * @returns {Promise<boolean>} True if successful
 */
async function dbSetTrackedWeapons(sessionId, player, weapons, conn) {
    const db = conn || pool
    try {
        const column =
            player === 0 ? "weapons_tracked_one" : "weapons_tracked_two"
        await db.execute(
            `UPDATE game_sessions SET ${column} = ? WHERE id = ?`,
            [JSON.stringify(weapons), sessionId.toString()]
        )
        return true
    } catch (error) {
        console.error("dbSetTrackedWeapons error:", error)
        return false
    }
}

/**
 * Gets weapon usage tracking for a session player.
 *
 * @param {BigInt|string} sessionId - Base session ID
 * @param {number} player - Player number (0 or 1)
 * @returns {Promise<Object>} Usage tracking { radar: N, shuffle: N }
 */
async function dbGetWeaponUsage(sessionId, player) {
    try {
        const column = player === 0 ? "weapons_used_one" : "weapons_used_two"
        const [rows] = await pool.execute(
            `SELECT ${column} as used FROM game_sessions WHERE id = ?`,
            [sessionId.toString()]
        )
        if (rows.length === 0) {
            return { radar: 0, shuffle: 0 }
        }
        return rows[0].used || { radar: 0, shuffle: 0 }
    } catch (error) {
        console.error("dbGetWeaponUsage error:", error)
        return { radar: 0, shuffle: 0 }
    }
}

/**
 * Increments weapon usage counter for a session player.
 *
 * @param {BigInt|string} sessionId - Base session ID
 * @param {number} player - Player number (0 or 1)
 * @param {string} weaponType - Weapon type ('radar' or 'shuffle')
 * @returns {Promise<boolean>} True if successful
 */
async function dbIncrementWeaponUsage(sessionId, player, weaponType) {
    try {
        const column = player === 0 ? "weapons_used_one" : "weapons_used_two"
        // Use JSON_SET to increment the counter, defaulting to 1 if not present
        await pool.execute(
            `UPDATE game_sessions
             SET ${column} = JSON_SET(
                 COALESCE(${column}, '{}'),
                 '$.${weaponType}',
                 COALESCE(JSON_EXTRACT(${column}, '$.${weaponType}'), 0) + 1
             )
             WHERE id = ?`,
            [sessionId.toString()]
        )
        return true
    } catch (error) {
        console.error("dbIncrementWeaponUsage error:", error)
        return false
    }
}

/**
 * Consumes weapons from user's inventory.
 * Called at game end for the loser.
 *
 * @param {number} userId - User ID
 * @param {Object} weaponCounts - Map of weaponId -> count to consume
 * @param {Object} conn - Database connection (required, for transaction)
 * @returns {Promise<boolean>} True if successful
 */
async function dbConsumeWeapons(userId, weaponCounts, conn) {
    try {
        for (const [weaponId, count] of Object.entries(weaponCounts)) {
            if (count <= 0) continue

            // Decrement quantity, delete row if quantity reaches 0
            await conn.execute(
                `UPDATE user_inventory
                 SET quantity = GREATEST(0, quantity - ?)
                 WHERE user_id = ? AND item_type = 'weapon' AND item_id = ?`,
                [count, userId, weaponId]
            )
        }

        // Clean up zero-quantity rows
        await conn.execute(
            `DELETE FROM user_inventory
             WHERE user_id = ? AND item_type = 'weapon' AND quantity <= 0`,
            [userId]
        )

        return true
    } catch (error) {
        console.error("dbConsumeWeapons error:", error)
        return false
    }
}

/**
 * Gets the user ID for a player in a session.
 *
 * @param {BigInt|string} sessionId - Base session ID
 * @param {number} player - Player number (0 or 1)
 * @returns {Promise<number|null>} User ID or null
 */
async function dbGetSessionUserId(sessionId, player) {
    try {
        const column = player === 0 ? "user_one_id" : "user_two_id"
        const [rows] = await pool.execute(
            `SELECT ${column} as user_id FROM game_sessions WHERE id = ?`,
            [sessionId.toString()]
        )
        if (rows.length === 0) {
            return null
        }
        return rows[0].user_id
    } catch (error) {
        console.error("dbGetSessionUserId error:", error)
        return null
    }
}

module.exports = {
    dbGetUserWeaponInventory,
    dbGetTrackedWeapons,
    dbSetTrackedWeapons,
    dbGetWeaponUsage,
    dbIncrementWeaponUsage,
    dbConsumeWeapons,
    dbGetSessionUserId,
}
