/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const {
    dbGetUserWeaponInventory,
    dbSetTrackedWeapons,
    dbGetTrackedWeapons,
    dbIncrementWeaponUsage,
    dbConsumeWeapons,
    dbGetSessionUserId,
} = require("../../db/navalclash/weapons")
const { logger } = require("../../utils/logger")

/**
 * Weapon type ID mapping.
 * Maps weapon codes to numeric IDs used in inventory.
 */
const WEAPON_CODE_TO_ID = {
    wmn: "0", // Mine
    mine: "0",
    dch: "1", // Dutch
    dutch: "1",
    anr: "2", // Radar
    radar: "2",
    smw: "3", // Shuffle
    shuffle: "3",
    sth: "4", // Stealth
    stealth: "4",
    cls: "5", // Classic shield
    cshield: "5",
}

/**
 * Weapon ID to name mapping for logging.
 */
const WEAPON_ID_TO_NAME = {
    0: "mine",
    1: "dutch",
    2: "radar",
    3: "shuffle",
    4: "stealth",
    5: "cshield",
}

/**
 * Converts weapon code to inventory item ID.
 *
 * @param {string} code - Weapon code (e.g., 'wmn', 'dch')
 * @returns {string|null} Inventory item ID or null if unknown
 */
function weaponCodeToId(code) {
    if (!code) return null
    const normalized = code.toLowerCase()
    return WEAPON_CODE_TO_ID[normalized] || null
}

/**
 * Counts weapons by type from a weapon placement array.
 *
 * @param {Array} weapons - Array of weapon objects with 'type' field
 * @returns {Object} Map of weaponId -> count
 */
function countWeaponsByType(weapons) {
    const counts = {}
    if (!weapons || !Array.isArray(weapons)) {
        return counts
    }
    for (const weapon of weapons) {
        const id = weaponCodeToId(weapon.type)
        if (id !== null) {
            counts[id] = (counts[id] || 0) + 1
        }
    }
    return counts
}

/**
 * Validates weapon placement against user's inventory.
 *
 * @param {Array} weapons - Array of weapon objects from wpl message
 * @param {number} userId - User ID
 * @param {Object} ctx - Logging context
 * @returns {Promise<Object>} { valid: boolean, error?: string, counts?: Object }
 */
async function validateWeaponPlacement(weapons, userId, ctx) {
    const counts = countWeaponsByType(weapons)
    const inventory = await dbGetUserWeaponInventory(userId)

    logger.debug(
        { ...ctx, userId, counts, inventory },
        "Validating weapon placement"
    )

    // Check each weapon type against inventory
    for (const [weaponId, needed] of Object.entries(counts)) {
        const available = inventory[weaponId] || 0
        const weaponName = WEAPON_ID_TO_NAME[weaponId] || weaponId
        if (needed > available) {
            const error = `Insufficient ${weaponName}: need ${needed}, have ${available}`
            logger.warn({ ...ctx, userId, weaponId, needed, available }, error)
            return { valid: false, error }
        }
    }

    return { valid: true, counts }
}

/**
 * Tracks weapon placement for a session.
 * Does NOT consume weapons - that happens at game end.
 *
 * @param {BigInt} baseSessionId - Base session ID
 * @param {number} player - Player number (0 or 1)
 * @param {Object} weaponCounts - Map of weaponId -> count
 * @param {Object} ctx - Logging context
 * @returns {Promise<boolean>} True if successful
 */
async function trackWeaponPlacement(baseSessionId, player, weaponCounts, ctx) {
    const result = await dbSetTrackedWeapons(baseSessionId, player, weaponCounts)
    if (result) {
        logger.debug(
            { ...ctx, player, weaponCounts },
            "Weapons tracked for session"
        )
    } else {
        logger.error({ ...ctx, player }, "Failed to track weapons")
    }
    return result
}

/**
 * Tracks radar usage for a session.
 *
 * @param {BigInt} baseSessionId - Base session ID
 * @param {number} player - Player number (0 or 1)
 * @param {Object} ctx - Logging context
 * @returns {Promise<boolean>} True if successful
 */
async function trackRadarUsage(baseSessionId, player, ctx) {
    const result = await dbIncrementWeaponUsage(baseSessionId, player, "radar")
    if (result) {
        logger.debug({ ...ctx, player }, "Radar usage tracked")
    }
    return result
}

/**
 * Tracks shuffle (ship move) usage for a session.
 *
 * @param {BigInt} baseSessionId - Base session ID
 * @param {number} player - Player number (0 or 1)
 * @param {Object} ctx - Logging context
 * @returns {Promise<boolean>} True if successful
 */
async function trackShuffleUsage(baseSessionId, player, ctx) {
    const result = await dbIncrementWeaponUsage(
        baseSessionId,
        player,
        "shuffle"
    )
    if (result) {
        logger.debug({ ...ctx, player }, "Shuffle usage tracked")
    }
    return result
}

/**
 * Consumes loser's weapons at game end.
 * Winner keeps their weapons (no consumption).
 *
 * @param {BigInt} baseSessionId - Base session ID
 * @param {number} loserPlayer - Loser's player number (0 or 1)
 * @param {Object} conn - Database connection (for transaction)
 * @param {Object} ctx - Logging context
 * @returns {Promise<boolean>} True if successful
 */
async function consumeLoserWeapons(baseSessionId, loserPlayer, conn, ctx) {
    // Get loser's user ID
    const loserId = await dbGetSessionUserId(baseSessionId, loserPlayer)
    if (!loserId) {
        logger.warn({ ...ctx, loserPlayer }, "Loser user ID not found")
        return true // Not an error - game can still finish
    }

    // Get tracked weapons for loser
    const tracked = await dbGetTrackedWeapons(baseSessionId, loserPlayer)
    if (!tracked || Object.keys(tracked).length === 0) {
        logger.debug(
            { ...ctx, loserPlayer, loserId },
            "No weapons to consume for loser"
        )
        return true
    }

    // Consume weapons from loser's inventory
    const result = await dbConsumeWeapons(loserId, tracked, conn)
    if (result) {
        logger.info(
            { ...ctx, loserId, loserPlayer, tracked },
            "Loser weapons consumed"
        )
    } else {
        logger.error({ ...ctx, loserId }, "Failed to consume loser weapons")
    }
    return result
}

module.exports = {
    // Constants
    WEAPON_CODE_TO_ID,
    WEAPON_ID_TO_NAME,
    // Functions
    weaponCodeToId,
    countWeaponsByType,
    validateWeaponPlacement,
    trackWeaponPlacement,
    trackRadarUsage,
    trackShuffleUsage,
    consumeLoserWeapons,
}
