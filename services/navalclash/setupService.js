/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("../../db/navalclash")
const { logger } = require("../../utils/logger")
const { TIMING } = require("./constants")

// In-memory cache for gamesetup values
const configCache = new Map()

/**
 * Cache entry structure.
 * @typedef {Object} CacheEntry
 * @property {number|string|null} value - Cached value
 * @property {number} expiresAt - Expiration timestamp in ms
 */

/**
 * Gets a config value from cache or database.
 * Values are cached for 1 hour to minimize database queries.
 *
 * @param {string} name - Config name (e.g., 'min_version', 'maintenance_mode')
 * @returns {Promise<Object|null>} Config object with int_value, str_value, or null if not found
 */
async function getConfig(name) {
    const now = Date.now()
    const cached = configCache.get(name)

    // Return cached value if still valid
    if (cached && cached.expiresAt > now) {
        logger.debug({ config: name, cached: true }, "Config cache hit")
        return cached.value
    }

    // Fetch from database
    try {
        const [rows] = await pool.execute(
            "SELECT * FROM gamesetup WHERE name = ?",
            [name]
        )

        const value = rows.length > 0 ? rows[0] : null

        // Cache the result (even null values to prevent repeated queries)
        configCache.set(name, {
            value,
            expiresAt: now + TIMING.CACHE_TTL_MS,
        })

        logger.debug(
            { config: name, cached: false, found: !!value },
            "Config loaded from database"
        )
        return value
    } catch (error) {
        logger.error({ config: name }, "Failed to load config:", error.message)
        return null
    }
}

/**
 * Gets the minimum allowed client version.
 * Returns 0 if not configured (allows all versions).
 *
 * @returns {Promise<number>} Minimum version number
 */
async function getMinVersion() {
    const config = await getConfig("min_version")
    return config?.int_value || 0
}

/**
 * Checks if the server is in maintenance mode.
 *
 * @returns {Promise<boolean>} True if maintenance mode is enabled
 */
async function isMaintenanceMode() {
    const config = await getConfig("maintenance_mode")
    return !!(config?.int_value)
}

/**
 * Invalidates a specific config cache entry.
 * Useful when config is updated via admin interface.
 *
 * @param {string} name - Config name to invalidate
 */
function invalidateConfig(name) {
    configCache.delete(name)
    logger.info({ config: name }, "Config cache invalidated")
}

/**
 * Invalidates all cached config entries.
 */
function invalidateAllConfigs() {
    configCache.clear()
    logger.info({}, "All config caches invalidated")
}

/**
 * Gets cache statistics for monitoring.
 *
 * @returns {Object} Cache stats including size and entries
 */
function getCacheStats() {
    const now = Date.now()
    const entries = []

    for (const [name, entry] of configCache) {
        entries.push({
            name,
            expiresIn: Math.max(0, Math.floor((entry.expiresAt - now) / 1000)),
            hasValue: entry.value !== null,
        })
    }

    return {
        size: configCache.size,
        entries,
    }
}

module.exports = {
    getConfig,
    getMinVersion,
    isMaintenanceMode,
    invalidateConfig,
    invalidateAllConfigs,
    getCacheStats,
}
