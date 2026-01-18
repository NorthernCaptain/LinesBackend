/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("../../db/navalclash")
const { logger } = require("../../utils/logger")
const { val2mess } = require("./gameService")

// Error codes for ibya response
const BUY_ERROR = {
    SUCCESS: 0,
    WRONG_PRICE: 3,
    DENIED: -1,
}

// Weapon index to name mapping
const WEAPON_NAMES = ["mine", "dutch", "radar", "shuffle", "stealth", "cshield"]

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
 * Get items list (ils) endpoint - returns available Armory items (weapons).
 * Called when user opens the Armory screen.
 *
 * Response format:
 * - nm: weapon index as string ("0"=mine, "1"=dutch, "2"=radar, "3"=shuffle, "4"=stealth, "5"=cshield)
 * - pr: price in coins
 * - mi: min purchase quantity
 * - ma: max purchase quantity
 * - up: unlock price (0 if already unlocked)
 * - im: "I" for internal (coin purchase), "G" for google play
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response with item list
 */
async function getItemsList(req, res) {
    const { u, lg } = req.body
    const ctx = { reqId: req.requestId }

    logger.debug(ctx, "Get items list request", { lg, hasUser: !!u })

    if (u) {
        ctx.userName = u.name
        ctx.uuid = u.uuid
        logger.debug(ctx, "Items list requested by user")
    }

    try {
        // Get all active armory items (weapons purchasable with coins)
        const [items] = await pool.execute(
            `SELECT weapon_index, price, min_qty, max_qty, unlock_price, purchase_type
             FROM shop_items
             WHERE is_active = 1
             ORDER BY sort_order, weapon_index`
        )

        logger.debug({ ...ctx, itemCount: items.length }, "Returning armory items")

        // Format items for client response
        const formattedItems = items.map((item) => ({
            type: "sku",
            nm: String(item.weapon_index),
            pr: item.price,
            mi: item.min_qty,
            ma: item.max_qty,
            up: item.unlock_price || 0,
            im: item.purchase_type || "I",
        }))

        return res.json({
            type: "ilsa",
            its: formattedItems,
        })
    } catch (error) {
        logger.error(ctx, "getItemsList error:", error.message)
        return res.json({
            type: "ilsa",
            its: [],
        })
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

/**
 * Builds user object for ibya response with weapon quantities.
 * Coins are ENCODED with val2mess().
 *
 * @param {Object} user - User data from database
 * @param {Array} weapons - Weapon quantities array [mine, dutch, radar, shuffle, stealth, cshield]
 * @returns {Object} User object for response
 */
function buildUserResponse(user, weapons) {
    return {
        nam: user.name,
        dev: "",
        id: user.uuid,
        ut: 2,
        rk: user.rank || 0,
        st: user.stars || 0,
        pld: user.games || 0,
        won: user.gameswon || 0,
        an: val2mess(user.coins || 0), // Coins ENCODED
        // Weapon quantities array (we[] in client) - indices 0-5
        we: weapons,
    }
}

/**
 * Internal buy (iby) endpoint - purchase weapons with in-game coins.
 *
 * Request format:
 * {
 *   type: "iby",
 *   u: { user object },
 *   lg: "en",
 *   tkn: 123456,
 *   its: [{ sku: "0", q: 5, p: 100 }, ...]
 * }
 *
 * Response format (ibya):
 * {
 *   type: "ibya",
 *   rc: 0,  // 0=success, 3=wrong price/no coins, -1=denied
 *   u: { updated user with encoded coins and weapon quantities }
 * }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function internalBuy(req, res) {
    const { u, lg, tkn, its } = req.body
    const ctx = { reqId: req.requestId }

    logger.debug(ctx, "Internal buy request", { lg, hasUser: !!u, itemCount: its?.length })

    // Validate request
    if (!u || !u.id) {
        logger.warn(ctx, "Internal buy missing user")
        return res.json({
            type: "ibya",
            rc: BUY_ERROR.DENIED,
            msg: { text: "Missing user" },
        })
    }

    if (!its || !Array.isArray(its) || its.length === 0) {
        logger.warn(ctx, "Internal buy missing items")
        return res.json({
            type: "ibya",
            rc: BUY_ERROR.DENIED,
            msg: { text: "Missing items" },
        })
    }

    ctx.uuid = u.id
    ctx.userName = u.nam

    const conn = await pool.getConnection()
    try {
        await conn.beginTransaction()

        // Find user by UUID
        const [users] = await conn.execute(
            `SELECT id, name, uuid, \`rank\`, stars, games, gameswon, coins
             FROM users WHERE uuid = ? FOR UPDATE`,
            [u.id]
        )

        if (users.length === 0) {
            await conn.rollback()
            logger.warn(ctx, "Internal buy user not found")
            return res.json({
                type: "ibya",
                rc: BUY_ERROR.DENIED,
                msg: { text: "User not found" },
            })
        }

        const user = users[0]
        ctx.uid = user.id

        // Get server's price list
        const [shopItems] = await conn.execute(
            "SELECT weapon_index, price FROM shop_items WHERE is_active = 1"
        )
        const priceMap = new Map(shopItems.map((item) => [String(item.weapon_index), item.price]))

        // Validate prices and calculate total cost
        let totalCost = 0
        const validatedItems = []

        for (const item of its) {
            const { sku, q, p } = item
            const serverPrice = priceMap.get(sku)

            if (serverPrice === undefined) {
                await conn.rollback()
                logger.warn({ ...ctx, sku }, "Internal buy invalid SKU")
                return res.json({
                    type: "ibya",
                    rc: BUY_ERROR.WRONG_PRICE,
                    msg: { text: "Invalid item" },
                })
            }

            // Validate price matches server
            if (p !== serverPrice) {
                await conn.rollback()
                logger.warn({ ...ctx, sku, clientPrice: p, serverPrice }, "Internal buy price mismatch")
                return res.json({
                    type: "ibya",
                    rc: BUY_ERROR.WRONG_PRICE,
                    msg: { text: "Price mismatch" },
                })
            }

            // q > 0 = buy, q < 0 = sell
            const cost = q * serverPrice
            totalCost += cost
            validatedItems.push({ sku, qty: q, price: serverPrice })
        }

        // Check if user has enough coins
        if (totalCost > user.coins) {
            await conn.rollback()
            logger.warn({ ...ctx, totalCost, userCoins: user.coins }, "Internal buy insufficient coins")
            return res.json({
                type: "ibya",
                rc: BUY_ERROR.WRONG_PRICE,
                msg: { text: "Insufficient coins" },
            })
        }

        // Deduct coins
        const newCoins = user.coins - totalCost
        await conn.execute("UPDATE users SET coins = ? WHERE id = ?", [newCoins, user.id])

        // Update inventory for each item
        for (const item of validatedItems) {
            if (item.qty > 0) {
                // Buying - add to inventory (upsert)
                await conn.execute(
                    `INSERT INTO user_inventory (user_id, item_type, item_id, quantity)
                     VALUES (?, 'weapon', ?, ?)
                     ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
                    [user.id, item.sku, item.qty, item.qty]
                )
            } else if (item.qty < 0) {
                // Selling - subtract from inventory
                await conn.execute(
                    `UPDATE user_inventory
                     SET quantity = GREATEST(0, quantity + ?)
                     WHERE user_id = ? AND item_type = 'weapon' AND item_id = ?`,
                    [item.qty, user.id, item.sku]
                )
            }
        }

        // Get updated weapon quantities
        const [inventory] = await conn.execute(
            `SELECT item_id, quantity FROM user_inventory
             WHERE user_id = ? AND item_type = 'weapon'`,
            [user.id]
        )

        // Build weapons array (indices 0-5)
        const weapons = [0, 0, 0, 0, 0, 0]
        for (const inv of inventory) {
            const idx = parseInt(inv.item_id, 10)
            if (idx >= 0 && idx < 6) {
                weapons[idx] = inv.quantity
            }
        }

        await conn.commit()

        // Update user object with new coins for response
        user.coins = newCoins

        // Log each item purchased with name, qty, price
        const itemDetails = validatedItems.map((item) => {
            const weaponName = WEAPON_NAMES[parseInt(item.sku, 10)] || `weapon_${item.sku}`
            const action = item.qty > 0 ? "bought" : "sold"
            return `${action} ${Math.abs(item.qty)}x ${weaponName} @ ${item.price}`
        })

        logger.info(
            { ...ctx, totalCost, newCoins, itemCount: validatedItems.length },
            `Internal buy: ${itemDetails.join(", ")}`
        )

        return res.json({
            type: "ibya",
            rc: BUY_ERROR.SUCCESS,
            u: buildUserResponse(user, weapons),
        })
    } catch (error) {
        await conn.rollback()
        logger.error(ctx, "Internal buy error:", error.message)
        return res.json({
            type: "ibya",
            rc: BUY_ERROR.DENIED,
            msg: { text: "Server error" },
        })
    } finally {
        conn.release()
    }
}

module.exports = {
    getItemsList,
    getInventory,
    addCoins,
    getCoins,
    internalBuy,
    // Exported for testing
    serializeInventoryItem,
    buildUserResponse,
    BUY_ERROR,
    WEAPON_NAMES,
}
