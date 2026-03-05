/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const crypto = require("crypto")
const {
    dbGetLicenseNonce,
    dbUpdateDeviceLicense,
} = require("../../db/navalclash")
const { logger } = require("../../utils/logger")
const { LICENSE } = require("./constants")

/** Expected package name for the AE app. */
const EXPECTED_PACKAGE = "northern.captain.seabattle.pro"

/** Maximum age of a license response timestamp (4 hours in ms). */
const MAX_TIMESTAMP_AGE_MS = 4 * 60 * 60 * 1000

/**
 * Loads the Google Play public key from environment variable.
 * Returns null if not configured.
 *
 * @returns {string|null} PEM-formatted public key or null
 */
function getGooglePublicKey() {
    const base64Key = process.env.GOOGLE_LICENSE_PUBLIC_KEY
    if (!base64Key) {
        return null
    }
    return (
        "-----BEGIN PUBLIC KEY-----\n" +
        base64Key.match(/.{1,64}/g).join("\n") +
        "\n-----END PUBLIC KEY-----"
    )
}

/**
 * Verifies the RSA-SHA1 signature on the response data.
 *
 * @param {string} signedData - The signed response data
 * @param {string} signature - Base64-encoded RSA-SHA1 signature
 * @param {string} publicKeyPem - PEM-formatted public key
 * @returns {boolean} True if signature is valid
 */
function verifySignature(signedData, signature, publicKeyPem) {
    try {
        const verifier = crypto.createVerify("SHA1")
        verifier.update(signedData)
        return verifier.verify(publicKeyPem, signature, "base64")
    } catch (error) {
        logger.error({}, "Signature verification error:", error.message)
        return false
    }
}

/**
 * Parses Google Play license response data.
 * Format: responseCode|nonce|packageName|versionCode|userId|timestamp:extra
 *
 * @param {string} responseData - Pipe-delimited response data
 * @returns {Object|null} Parsed fields or null on error
 */
function parseResponseData(responseData) {
    if (!responseData) return null

    const parts = responseData.split("|")
    if (parts.length < 6) return null

    return {
        responseCode: parseInt(parts[0], 10),
        nonce: parts[1],
        packageName: parts[2],
        versionCode: parts[3],
        userId: parts[4],
        timestamp: parts[5],
    }
}

/**
 * Checks whether a license response timestamp is within the allowed window.
 * The timestamp field may contain a colon-separated suffix (e.g. "1234567890000:extra").
 *
 * @param {string} timestampStr - Timestamp string from response data
 * @returns {boolean} True if the timestamp is within MAX_TIMESTAMP_AGE_MS of now
 */
function isTimestampRecent(timestampStr) {
    if (!timestampStr) return false

    // Strip any colon-separated suffix
    const msStr = timestampStr.split(":")[0]
    const ms = parseInt(msStr, 10)
    if (isNaN(ms)) return false

    const age = Date.now() - ms
    return age >= 0 && age <= MAX_TIMESTAMP_AGE_MS
}

/**
 * Maps a Google Play response code to our license status.
 *
 * @param {number} responseCode - Google Play response code
 * @returns {number} LICENSE status constant
 */
function mapResponseCode(responseCode) {
    switch (responseCode) {
        case 0x0: // LICENSED
        case 0x1: // LICENSED_OLD_KEY
            return LICENSE.LICENSED
        case 0x2: // NOT_LICENSED
            return LICENSE.NOT_LICENSED
        case 0x3: // RETRY
            return LICENSE.RETRY
        default:
            return LICENSE.NOT_LICENSED
    }
}

/**
 * Generates a random license nonce within JSON-safe integer range.
 * Limited to 53 bits to avoid IEEE 754 double precision loss
 * during JSON serialization/parsing.
 *
 * @returns {number} Random positive integer (up to 2^53 - 1)
 */
function generateLicenseNonce() {
    const bytes = crypto.randomBytes(7)
    // 7 bytes = 56 bits, mask to 53 bits for Number.MAX_SAFE_INTEGER
    const hex = bytes.toString("hex")
    return Number(BigInt("0x" + hex) & BigInt("0x1FFFFFFFFFFFFF"))
}

/**
 * License verification endpoint handler.
 * Verifies Google Play LVL response and updates device license status.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function verifyLicense(req, res) {
    const { did, rd, sig, rc } = req.body
    const ctx = { reqId: req.requestId, did, rc }

    logger.info(ctx, "License verification request")

    if (!did || rd === undefined || sig === undefined || rc === undefined) {
        logger.warn(ctx, "License verification missing parameters")
        return res.json({ type: "lvlack" })
    }

    const publicKeyPem = getGooglePublicKey()
    if (!publicKeyPem) {
        logger.warn(ctx, "GOOGLE_LICENSE_PUBLIC_KEY not configured")
        return res.json({ type: "lvlack" })
    }

    // Verify RSA-SHA1 signature
    if (!verifySignature(rd, sig, publicKeyPem)) {
        logger.warn(ctx, "Invalid license signature")
        await dbUpdateDeviceLicense(did, LICENSE.NOT_LICENSED)
        return res.json({ type: "lvlack" })
    }

    // Parse response data
    const parsed = parseResponseData(rd)
    if (!parsed) {
        logger.warn(ctx, "Failed to parse response data")
        await dbUpdateDeviceLicense(did, LICENSE.NOT_LICENSED)
        return res.json({ type: "lvlack" })
    }

    // Verify nonce matches
    const storedNonce = await dbGetLicenseNonce(did)
    if (!storedNonce || storedNonce !== parsed.nonce) {
        logger.warn(
            { ...ctx, stored: storedNonce, received: parsed.nonce },
            "Nonce mismatch"
        )
        await dbUpdateDeviceLicense(did, LICENSE.NOT_LICENSED)
        return res.json({ type: "lvlack" })
    }

    // Verify package name
    if (parsed.packageName !== EXPECTED_PACKAGE) {
        logger.warn(
            { ...ctx, pkg: parsed.packageName },
            "Package name mismatch"
        )
        await dbUpdateDeviceLicense(did, LICENSE.NOT_LICENSED)
        return res.json({ type: "lvlack" })
    }

    // Verify timestamp is within 4 hours
    if (!isTimestampRecent(parsed.timestamp)) {
        logger.warn(
            { ...ctx, ts: parsed.timestamp },
            "License response timestamp too old"
        )
        await dbUpdateDeviceLicense(did, LICENSE.NOT_LICENSED)
        return res.json({ type: "lvlack" })
    }

    // Map response code to license status
    const status = mapResponseCode(parsed.responseCode)
    await dbUpdateDeviceLicense(did, status)

    logger.info({ ...ctx, status }, "License verification complete")
    return res.json({ type: "lvlack" })
}

module.exports = {
    verifyLicense,
    generateLicenseNonce,
    // Exported for testing
    verifySignature,
    parseResponseData,
    mapResponseCode,
    isTimestampRecent,
    getGooglePublicKey,
    EXPECTED_PACKAGE,
    MAX_TIMESTAMP_AGE_MS,
}
