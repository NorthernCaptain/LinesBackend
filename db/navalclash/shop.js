/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("./pool")

/**
 * Checks if an order already exists.
 *
 * @param {string} orderId - Order ID
 * @returns {Promise<boolean>} True if order exists
 */
async function dbOrderExists(orderId) {
    try {
        const [rows] = await pool.execute(
            "SELECT id FROM purchases WHERE order_id = ?",
            [orderId]
        )
        return rows.length > 0
    } catch (error) {
        console.error("dbOrderExists error:", error)
        return true
    }
}

/**
 * Records a purchase.
 *
 * @param {Object} purchaseData - Purchase data
 * @param {number} purchaseData.userId - User ID
 * @param {number|null} purchaseData.deviceId - Device ID
 * @param {string} purchaseData.sku - Product SKU
 * @param {string} purchaseData.orderId - Order ID
 * @param {string|null} purchaseData.token - Purchase token
 * @param {number} purchaseData.coinsAdded - Coins added
 * @returns {Promise<number|null>} New purchase ID or null on error
 */
async function dbRecordPurchase(purchaseData) {
    try {
        const [result] = await pool.execute(
            `INSERT INTO purchases (user_id, device_id, sku, order_id, purchase_token, coins_added)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                purchaseData.userId,
                purchaseData.deviceId,
                purchaseData.sku,
                purchaseData.orderId,
                purchaseData.token,
                purchaseData.coinsAdded,
            ]
        )
        return result.insertId
    } catch (error) {
        console.error("dbRecordPurchase error:", error)
        return null
    }
}

/**
 * Adds coins to user's balance.
 *
 * @param {number} userId - User ID
 * @param {number} coins - Coins to add
 * @returns {Promise<boolean>} True if successful
 */
async function dbAddCoins(userId, coins) {
    try {
        await pool.execute("UPDATE users SET coins = coins + ? WHERE id = ?", [
            coins,
            userId,
        ])
        return true
    } catch (error) {
        console.error("dbAddCoins error:", error)
        return false
    }
}

/**
 * Gets user's coin balance.
 *
 * @param {number} userId - User ID
 * @returns {Promise<number>} Coin balance
 */
async function dbGetCoins(userId) {
    try {
        const [rows] = await pool.execute(
            "SELECT coins FROM users WHERE id = ?",
            [userId]
        )
        return rows.length > 0 ? rows[0].coins : 0
    } catch (error) {
        console.error("dbGetCoins error:", error)
        return 0
    }
}

/**
 * Gets user's inventory.
 *
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of inventory items
 */
async function dbGetInventory(userId) {
    try {
        const [rows] = await pool.execute(
            "SELECT item_type, item_id, quantity, times_used FROM user_inventory WHERE user_id = ?",
            [userId]
        )
        return rows
    } catch (error) {
        console.error("dbGetInventory error:", error)
        return []
    }
}

module.exports = {
    dbOrderExists,
    dbRecordPurchase,
    dbAddCoins,
    dbGetCoins,
    dbGetInventory,
}
