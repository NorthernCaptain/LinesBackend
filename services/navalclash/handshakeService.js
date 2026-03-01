/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const {
    parseHandshakeRequest,
    rsaDecrypt,
    aesGcmEncrypt,
    generateDeviceToken,
    tokenToBase64,
} = require("../../utils/encryption")
const { dbStoreDeviceKey } = require("../../db/navalclash/keys")
const { logger } = require("../../utils/logger")

// Generic error response - never leak details to client
const PROTOCOL_ERROR = { error: "PROTOCOL_ERROR" }

// Token TTL: 4 hours
const TOKEN_TTL_SECONDS = 4 * 60 * 60

/**
 * POST /handshake - Establish encryption key.
 * Binary format: [sig 2][ver 1][keyIdx 1][len 2][RSA-encrypted JSON]
 * Response: AES-encrypted JSON with device token.
 *
 * @param {Object} req - Express request with raw binary body
 * @param {Object} res - Express response
 */
async function handshake(req, res) {
    // Parse binary handshake request
    let keyIndex, encrypted
    try {
        ;({ keyIndex, encrypted } = parseHandshakeRequest(req.body))
    } catch (error) {
        logger.error({}, "Handshake: parse error:", error.message)
        return res.status(400).json(PROTOCOL_ERROR)
    }

    // Decrypt with appropriate RSA private key
    let payload
    try {
        const decrypted = rsaDecrypt(encrypted, keyIndex)
        payload = JSON.parse(decrypted.toString("utf8"))
    } catch (error) {
        logger.error(
            {},
            "Handshake: decrypt error (ki=" + keyIndex + "):",
            error.message
        )
        return res.status(400).json(PROTOCOL_ERROR)
    }

    // Extract and validate fields
    const { key: keyBase64, uuid, uuuid, v, p } = payload

    if (!keyBase64 || !uuid) {
        logger.error(
            {},
            "Handshake: missing fields, uuid:",
            uuid ? "present" : "missing",
            "key:",
            keyBase64 ? "present" : "missing"
        )
        return res.status(400).json(PROTOCOL_ERROR)
    }

    // Decode AES key
    const deviceKey = Buffer.from(keyBase64, "base64")
    if (deviceKey.length !== 32) {
        logger.error({}, "Handshake: invalid key length:", deviceKey.length)
        return res.status(400).json(PROTOCOL_ERROR)
    }

    // Generate device token
    const tokenBinary = generateDeviceToken(TOKEN_TTL_SECONDS)
    const tokenBase64 = tokenToBase64(tokenBinary)

    // Store token -> key mapping
    const stored = await dbStoreDeviceKey(
        tokenBase64,
        deviceKey,
        uuid,
        TOKEN_TTL_SECONDS
    )
    if (!stored) {
        logger.error({ did: uuid }, "Handshake: failed to store device key")
        return res.status(500).json(PROTOCOL_ERROR)
    }

    logger.info(
        { did: uuid },
        "Handshake: success, ki=" + keyIndex,
        "v=" + v,
        "p=" + p
    )

    // Build and encrypt response
    const responseJson = JSON.stringify({
        type: "ok",
        dt: tokenBase64,
    })

    const { iv, ciphertext } = aesGcmEncrypt(
        deviceKey,
        Buffer.from(responseJson, "utf8")
    )

    // Return binary: [12 byte IV][ciphertext + tag]
    res.set("Content-Type", "application/octet-stream")
    res.send(Buffer.concat([iv, ciphertext]))
}

module.exports = { handshake }
