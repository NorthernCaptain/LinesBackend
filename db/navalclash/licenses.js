/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("./pool")

/**
 * Saves a license nonce for a device.
 *
 * @param {string} androidId - Android device ID
 * @param {number} nonce - License nonce value (53-bit safe integer)
 * @returns {Promise<boolean>} True if saved successfully
 */
async function dbSaveLicenseNonce(androidId, nonce) {
    try {
        await pool.execute(
            "UPDATE devices SET license_nonce = ? WHERE android_id = ?",
            [nonce.toString(), androidId]
        )
        return true
    } catch (error) {
        console.error("dbSaveLicenseNonce error:", error)
        return false
    }
}

/**
 * Gets the license nonce for a device.
 *
 * @param {string} androidId - Android device ID
 * @returns {Promise<string|null>} Nonce as string, or null if not found
 */
async function dbGetLicenseNonce(androidId) {
    try {
        const [rows] = await pool.execute(
            "SELECT license_nonce FROM devices WHERE android_id = ?",
            [androidId]
        )
        if (rows.length === 0 || rows[0].license_nonce == null) {
            return null
        }
        return rows[0].license_nonce.toString()
    } catch (error) {
        console.error("dbGetLicenseNonce error:", error)
        return null
    }
}

/**
 * Updates the license status for a device and clears the nonce.
 *
 * @param {string} androidId - Android device ID
 * @param {number|null} status - License status (1=licensed, 2=not_licensed, 3=retry, 4=non_applicable)
 * @returns {Promise<boolean>} True if updated successfully
 */
async function dbUpdateDeviceLicense(androidId, status) {
    try {
        await pool.execute(
            `UPDATE devices
             SET license_status = ?,
                 license_nonce = NULL,
                 license_checked_at = NOW()
             WHERE android_id = ?`,
            [status, androidId]
        )
        return true
    } catch (error) {
        console.error("dbUpdateDeviceLicense error:", error)
        return false
    }
}

module.exports = {
    dbSaveLicenseNonce,
    dbGetLicenseNonce,
    dbUpdateDeviceLicense,
}
