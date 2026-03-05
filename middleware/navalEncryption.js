/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const {
    aesGcmDecrypt,
    aesGcmEncrypt,
    validateDeviceToken,
    tokenToBase64,
} = require("../utils/encryption")
const { dbGetDeviceKey } = require("../db/navalclash/keys")
const { logger } = require("../utils/logger")

// Generic error response - never leak details to client
const PROTOCOL_ERROR = { error: "PROTOCOL_ERROR" }

/**
 * Parses binary request format.
 * Format: [32 byte token][12 byte IV][ciphertext+tag]
 *
 * @param {Buffer} body - Raw request body
 * @returns {{ token: Buffer, iv: Buffer, ciphertext: Buffer }}
 * @throws {Error} If body is too short
 */
function parseBinaryRequest(body) {
    // Minimum: 32 (token) + 12 (IV) + 16 (tag) + 1 (min ciphertext)
    if (!Buffer.isBuffer(body) || body.length < 61) {
        throw new Error("Request too short")
    }

    const token = body.slice(0, 32)
    const iv = body.slice(32, 44)
    const ciphertext = body.slice(44)

    return { token, iv, ciphertext }
}

/**
 * Builds binary response format.
 * Format: [12 byte IV][ciphertext+tag]
 *
 * @param {Buffer} iv - 12-byte IV
 * @param {Buffer} ciphertext - Ciphertext with tag appended
 * @returns {Buffer}
 */
function buildBinaryResponse(iv, ciphertext) {
    return Buffer.concat([iv, ciphertext])
}

/**
 * Express middleware for encrypted Naval Clash requests.
 * Expects raw binary body (use express.raw() before this middleware).
 *
 * Decrypts the request, replaces req.body with parsed JSON,
 * and overrides res.json() to encrypt responses.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
async function navalEncryption(req, res, next) {
    // Parse binary request
    let token, iv, ciphertext
    try {
        ;({ token, iv, ciphertext } = parseBinaryRequest(req.body))
    } catch (error) {
        logger.error({}, "Encryption: parse error:", error.message)
        return res.status(400).json(PROTOCOL_ERROR)
    }

    // Validate token (HMAC + expiry check, no DB needed)
    const tokenResult = validateDeviceToken(token)
    if (!tokenResult.valid) {
        if (tokenResult.expired) {
            return res.status(401).json({ error: "TOKEN_EXPIRED" })
        }
        logger.error({}, "Encryption: invalid token HMAC")
        return res.status(401).json(PROTOCOL_ERROR)
    }

    // Look up encryption key by token
    const tokenBase64 = tokenToBase64(token)
    const keyRecord = await dbGetDeviceKey(tokenBase64)
    if (!keyRecord) {
        logger.error(
            {},
            "Encryption: token not in DB:",
            tokenBase64.substring(0, 8) + "..."
        )
        return res.status(401).json(PROTOCOL_ERROR)
    }

    // Decrypt request body
    try {
        const plaintext = aesGcmDecrypt(keyRecord.key, iv, ciphertext)
        req.body = JSON.parse(plaintext.toString("utf8"))
        req.navalDeviceUuid = keyRecord.deviceUuid
        req.navalKey = keyRecord.key
        req.navalPlatform = keyRecord.platform || "unknown"
    } catch (error) {
        logger.error({}, "Encryption: decrypt error:", error.message)
        return res.status(400).json(PROTOCOL_ERROR)
    }

    // Override res.json to encrypt the response
    const originalSend = res.send.bind(res)
    res.json = (body) => {
        const plaintext = Buffer.from(JSON.stringify(body), "utf8")
        const { iv: respIv, ciphertext: respCiphertext } = aesGcmEncrypt(
            req.navalKey,
            plaintext
        )

        res.set("Content-Type", "application/octet-stream")
        return originalSend(buildBinaryResponse(respIv, respCiphertext))
    }

    next()
}

module.exports = { navalEncryption, parseBinaryRequest, buildBinaryResponse }
