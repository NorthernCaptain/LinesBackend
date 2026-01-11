/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("./pool")

/**
 * Finds a device by Android ID.
 *
 * @param {string} androidId - Android device ID
 * @returns {Promise<Object|null>} Device object or null if not found
 */
async function dbFindDeviceByAndroidId(androidId) {
    try {
        const [rows] = await pool.execute(
            "SELECT * FROM devices WHERE android_id = ?",
            [androidId]
        )
        return rows.length > 0 ? rows[0] : null
    } catch (error) {
        console.error("dbFindDeviceByAndroidId error:", error)
        return null
    }
}

/**
 * Creates a new device.
 *
 * @param {Object} deviceData - Device data
 * @returns {Promise<number|null>} New device ID or null on error
 */
async function dbCreateDevice(deviceData) {
    try {
        const [result] = await pool.execute(
            `INSERT INTO devices
                (android_id, device, model, manufacturer, product, os_version,
                 disp_dpi, disp_height, disp_width, disp_scale, disp_size, app_version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                deviceData.androidId,
                deviceData.device || null,
                deviceData.model || null,
                deviceData.manufacturer || null,
                deviceData.product || null,
                deviceData.osVersion || null,
                deviceData.dispDpi || null,
                deviceData.dispHeight || null,
                deviceData.dispWidth || null,
                deviceData.dispScale || null,
                deviceData.dispSize || null,
                deviceData.appVersion || 0,
            ]
        )
        return result.insertId
    } catch (error) {
        console.error("dbCreateDevice error:", error)
        return null
    }
}

/**
 * Updates device info.
 *
 * @param {number} deviceId - Device ID
 * @param {Object} deviceData - Device data to update
 * @returns {Promise<boolean>} True if updated successfully
 */
async function dbUpdateDevice(deviceId, deviceData) {
    try {
        await pool.execute(
            `UPDATE devices SET
                model = COALESCE(?, model),
                manufacturer = COALESCE(?, manufacturer),
                os_version = COALESCE(?, os_version),
                app_version = ?,
                updated_at = NOW()
             WHERE id = ?`,
            [
                deviceData.model,
                deviceData.manufacturer,
                deviceData.osVersion,
                deviceData.appVersion || 0,
                deviceId,
            ]
        )
        return true
    } catch (error) {
        console.error("dbUpdateDevice error:", error)
        return false
    }
}

/**
 * Links a device to a user (creates or updates the relationship).
 *
 * @param {number} userId - User ID
 * @param {number} deviceId - Device ID
 * @returns {Promise<boolean>} True if successful
 */
async function dbLinkUserDevice(userId, deviceId) {
    try {
        await pool.execute(
            `INSERT INTO user_devices (user_id, device_id)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE last_used_at = NOW()`,
            [userId, deviceId]
        )
        return true
    } catch (error) {
        console.error("dbLinkUserDevice error:", error)
        return false
    }
}

module.exports = {
    dbFindDeviceByAndroidId,
    dbCreateDevice,
    dbUpdateDevice,
    dbLinkUserDevice,
}
