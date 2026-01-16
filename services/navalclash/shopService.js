/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("../../db/navalclash")
const { logger } = require("../../utils/logger")

/**
 * Serializes an inventory item for API response.
 *
 * @param {Object} row - Database row
 * @returns {Object} Serialized item
 */
function serializeInventoryItem(row) {
    return {
        type: row.item_type,
        id: row.item_id,
        qty: row.quantity,
        used: row.times_used,
    }
}

/**
 * Get inventory endpoint - returns user's inventory and coins.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function getInventory(req, res) {
    const { uid } = req.body
    const ctx = { reqId: req.requestId, uid }

    logger.debug(ctx, "Get inventory request")

    if (!uid) {
        logger.warn(ctx, "Get inventory missing user ID")
        return res.json({ type: "error", reason: "Missing user ID" })
    }

    try {
        const [items] = await pool.execute(
            "SELECT item_type, item_id, quantity, times_used FROM user_inventory WHERE user_id = ?",
            [uid]
        )

        const [users] = await pool.execute(
            "SELECT coins FROM users WHERE id = ?",
            [uid]
        )

        const coins = users.length > 0 ? users[0].coins : 0

        logger.debug({ ...ctx, itemCount: items.length, coins }, "Returning inventory")
        return res.json({
            type: "inventory",
            coins: coins,
            items: items.map(serializeInventoryItem),
        })
    } catch (error) {
        logger.error(ctx, "getInventory error:", error.message)
        return res.json({ type: "error", reason: "Database error" })
    }
}

/**
 * Add coins to user's balance (internal use, e.g., from rewards).
 *
 * @param {number} userId - User ID
 * @param {number} coins - Coins to add
 * @param {Object} ctx - Logging context
 * @returns {Promise<boolean>} True if successful
 */
async function addCoins(userId, coins, ctx) {
    try {
        await pool.execute("UPDATE users SET coins = coins + ? WHERE id = ?", [
            coins,
            userId,
        ])
        logger.info({ ...ctx, userId, coins }, "Coins added to user")
        return true
    } catch (error) {
        logger.error(ctx, "addCoins error:", error.message)
        return false
    }
}

/**
 * Get user's coin balance (internal use).
 *
 * @param {number} userId - User ID
 * @returns {Promise<number>} Coin balance
 */
async function getCoins(userId) {
    try {
        const [rows] = await pool.execute(
            "SELECT coins FROM users WHERE id = ?",
            [userId]
        )
        return rows.length > 0 ? rows[0].coins : 0
    } catch (error) {
        logger.error({ userId }, "getCoins error:", error.message)
        return 0
    }
}

module.exports = {
    getInventory,
    addCoins,
    getCoins,
    // Exported for testing
    serializeInventoryItem,
}
