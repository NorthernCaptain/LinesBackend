/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("./pool")

const LRU_CACHE_SIZE = 30

/**
 * Simple LRU cache for device keys.
 * Each server worker has its own cache instance.
 */
class DeviceKeyCache {
    /**
     * @param {number} maxSize - Maximum cache entries
     */
    constructor(maxSize = LRU_CACHE_SIZE) {
        this.maxSize = maxSize
        this.cache = new Map() // Map maintains insertion order
    }

    /**
     * Gets a key from cache, promoting to most-recently-used.
     *
     * @param {string} tokenBase64 - Device token
     * @returns {{ key: Buffer, deviceUuid: string } | null}
     */
    get(tokenBase64) {
        if (!this.cache.has(tokenBase64)) {
            return null
        }
        const value = this.cache.get(tokenBase64)
        this.cache.delete(tokenBase64)
        this.cache.set(tokenBase64, value)
        return value
    }

    /**
     * Adds a key to cache, evicting LRU entry if at capacity.
     *
     * @param {string} tokenBase64 - Device token
     * @param {Buffer} key - AES key
     * @param {string} deviceUuid - Device UUID
     */
    set(tokenBase64, key, deviceUuid) {
        if (this.cache.has(tokenBase64)) {
            this.cache.delete(tokenBase64)
        }
        if (this.cache.size >= this.maxSize) {
            const lruKey = this.cache.keys().next().value
            this.cache.delete(lruKey)
        }
        this.cache.set(tokenBase64, { key, deviceUuid })
    }

    /**
     * Removes a key from cache.
     *
     * @param {string} tokenBase64 - Device token
     */
    delete(tokenBase64) {
        this.cache.delete(tokenBase64)
    }

    /**
     * Clears the entire cache.
     */
    clear() {
        this.cache.clear()
    }

    /**
     * Returns current cache size.
     *
     * @returns {number}
     */
    get size() {
        return this.cache.size
    }
}

// Singleton instance per server process
const deviceKeyCache = new DeviceKeyCache()

/**
 * Gets device key, checking LRU cache first.
 *
 * @param {string} tokenBase64 - Base64-encoded device token
 * @returns {Promise<{ key: Buffer, deviceUuid: string } | null>}
 */
async function dbGetDeviceKey(tokenBase64) {
    const cached = deviceKeyCache.get(tokenBase64)
    if (cached) {
        return cached
    }

    try {
        const [rows] = await pool.execute(
            `SELECT device_key, device_uuid FROM device_keys
             WHERE device_token = ? AND expires_at > NOW()`,
            [tokenBase64]
        )

        if (rows.length === 0) {
            return null
        }

        const result = {
            key: rows[0].device_key,
            deviceUuid: rows[0].device_uuid,
        }

        deviceKeyCache.set(tokenBase64, result.key, result.deviceUuid)
        return result
    } catch (error) {
        console.error("dbGetDeviceKey error:", error)
        return null
    }
}

/**
 * Stores device key in database and cache.
 *
 * @param {string} tokenBase64 - Base64-encoded device token
 * @param {Buffer} key - 32-byte AES key
 * @param {string} deviceUuid - Device UUID
 * @param {number} ttlSeconds - Time to live in seconds
 * @returns {Promise<boolean>} True if stored successfully
 */
async function dbStoreDeviceKey(tokenBase64, key, deviceUuid, ttlSeconds) {
    try {
        await pool.execute(
            `INSERT INTO device_keys
                (device_token, device_key, device_uuid, expires_at)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
             ON DUPLICATE KEY UPDATE
                device_key = VALUES(device_key),
                expires_at = VALUES(expires_at)`,
            [tokenBase64, key, deviceUuid, ttlSeconds]
        )

        deviceKeyCache.set(tokenBase64, key, deviceUuid)
        return true
    } catch (error) {
        console.error("dbStoreDeviceKey error:", error)
        return false
    }
}

/**
 * Deletes expired device keys from database.
 *
 * @returns {Promise<number>} Number of deleted rows
 */
async function dbCleanupExpiredKeys() {
    try {
        const [result] = await pool.execute(
            "DELETE FROM device_keys WHERE expires_at < NOW()"
        )
        return result.affectedRows || 0
    } catch (error) {
        console.error("dbCleanupExpiredKeys error:", error)
        return 0
    }
}

module.exports = {
    DeviceKeyCache,
    deviceKeyCache,
    dbGetDeviceKey,
    dbStoreDeviceKey,
    dbCleanupExpiredKeys,
}
