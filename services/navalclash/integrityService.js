/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { google } = require("googleapis")
const {
    dbGetLicenseNonce,
    dbUpdateDeviceLicenseBits,
} = require("../../db/navalclash")
const { logger } = require("../../utils/logger")
const { LICENSE } = require("./constants")

/** Expected package name for the AE app. */
const EXPECTED_PACKAGE = "northern.captain.seabattle.pro"

/** Cached Google Auth client. */
let cachedAuth = null

/**
 * Creates or returns the cached Google Auth client for Play Integrity API.
 *
 * @returns {Object|null} Google Auth client or null if not configured
 */
function getAuthClient() {
    if (cachedAuth) return cachedAuth

    const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_PATH
    if (!keyFile) return null

    cachedAuth = new google.auth.GoogleAuth({
        keyFile,
        scopes: ["https://www.googleapis.com/auth/playintegrity"],
    })
    return cachedAuth
}

/**
 * Decodes a Play Integrity token via Google's API.
 *
 * @param {string} token - Integrity token from client
 * @returns {Promise<Object>} Token payload external
 */
async function decodeIntegrityToken(token) {
    const auth = getAuthClient()
    const client = google.playintegrity({ version: "v1", auth })
    const result = await client.v1.decodeIntegrityToken({
        packageName: EXPECTED_PACKAGE,
        requestBody: { integrity_token: token },
    })
    return result.data.tokenPayloadExternal
}

/**
 * Extracts the nonce string from the integrity token payload.
 * The client base64-encodes the string representation of the numeric nonce.
 *
 * @param {string} base64Nonce - Base64url-encoded nonce from token payload
 * @returns {string} Decoded nonce string
 */
function decodeNonce(base64Nonce) {
    return Buffer.from(base64Nonce, "base64").toString("utf8")
}

/**
 * Builds the integrity bitmask from the token payload verdicts.
 *
 * @param {Object} payload - Token payload external from Google
 * @returns {number} Bitmask with INT bits set
 */
function buildIntegrityBits(payload) {
    let bits = LICENSE.INT_CHECKED

    const deviceVerdict =
        payload.deviceIntegrity?.deviceRecognitionVerdict || []
    if (deviceVerdict.includes("MEETS_DEVICE_INTEGRITY")) {
        bits |= LICENSE.INT_DEVICE_OK
    }

    const appVerdict = payload.appIntegrity?.appRecognitionVerdict
    if (appVerdict === "PLAY_RECOGNIZED") {
        bits |= LICENSE.INT_APP_RECOGNIZED
    }

    const licenseVerdict = payload.accountDetails?.appLicensingVerdict
    if (licenseVerdict === "LICENSED") {
        bits |= LICENSE.INT_LICENSED
    }

    return bits
}

/**
 * Play Integrity verification endpoint handler.
 * Verifies the integrity token and updates device integrity bits.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function verifyIntegrity(req, res) {
    const { did, token } = req.body
    const ctx = { reqId: req.requestId, did }

    logger.info(ctx, "Integrity verification request")

    if (!did || !token) {
        logger.warn(ctx, "Integrity verification missing parameters")
        return res.json({ type: "intact" })
    }

    const auth = getAuthClient()
    if (!auth) {
        logger.warn(ctx, "GOOGLE_SERVICE_ACCOUNT_PATH not configured")
        return res.json({ type: "intact" })
    }

    let payload
    try {
        payload = await decodeIntegrityToken(token)
    } catch (error) {
        logger.error(
            { ...ctx, error: error.message },
            "Failed to decode integrity token"
        )
        return res.json({ type: "intact" })
    }

    // Verify nonce matches stored value
    const receivedNonce = decodeNonce(
        payload.requestDetails?.nonce || ""
    )
    const storedNonce = await dbGetLicenseNonce(did)
    if (!storedNonce || storedNonce !== receivedNonce) {
        logger.warn(
            { ...ctx, stored: storedNonce, received: receivedNonce },
            "Integrity nonce mismatch"
        )
        await dbUpdateDeviceLicenseBits(
            did,
            LICENSE.INT_MASK,
            LICENSE.INT_CHECKED
        )
        return res.json({ type: "intact" })
    }

    // Verify package name
    const packageName = payload.appIntegrity?.packageName
    if (packageName !== EXPECTED_PACKAGE) {
        logger.warn(
            { ...ctx, pkg: packageName },
            "Integrity package name mismatch"
        )
        await dbUpdateDeviceLicenseBits(
            did,
            LICENSE.INT_MASK,
            LICENSE.INT_CHECKED
        )
        return res.json({ type: "intact" })
    }

    // Build and store integrity bitmask
    const bits = buildIntegrityBits(payload)
    await dbUpdateDeviceLicenseBits(did, LICENSE.INT_MASK, bits)

    logger.info({ ...ctx, bits }, "Integrity verification complete")
    return res.json({ type: "intact" })
}

module.exports = {
    verifyIntegrity,
    // Exported for testing
    decodeNonce,
    buildIntegrityBits,
    decodeIntegrityToken,
    getAuthClient,
    EXPECTED_PACKAGE,
}
