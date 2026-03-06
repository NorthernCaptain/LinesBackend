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
 * Updates specific license status bits for a device using a bitmask.
 * Clears the bits indicated by mask, then sets the new bits.
 *
 * @param {string} androidId - Android device ID
 * @param {number} mask - Bitmask of bits to clear (e.g. LVL_MASK or INT_MASK)
 * @param {number} bits - New bits to set within the cleared region
 * @returns {Promise<boolean>} True if updated successfully
 */
async function dbUpdateDeviceLicenseBits(androidId, mask, bits) {
    try {
        await pool.execute(
            `UPDATE devices
             SET license_status = (COALESCE(license_status, 0) & ~?) | ?,
                 license_checked_at = NOW()
             WHERE android_id = ?`,
            [mask, bits, androidId]
        )
        return true
    } catch (error) {
        console.error("dbUpdateDeviceLicenseBits error:", error)
        return false
    }
}

/**
 * Updates the license status for a device (backward-compatible wrapper).
 * Replaces the entire license_status value.
 *
 * @param {string} androidId - Android device ID
 * @param {number|null} status - Full license status value
 * @returns {Promise<boolean>} True if updated successfully
 */
async function dbUpdateDeviceLicense(androidId, status) {
    try {
        await pool.execute(
            `UPDATE devices
             SET license_status = ?,
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
    dbUpdateDeviceLicenseBits,
}
