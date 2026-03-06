/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const crypto = require("crypto")
const fs = require("fs")

// Handshake protocol constants
const HANDSHAKE_SIGNATURE = 0xfac2
const HANDSHAKE_VERSION = 0x02

/**
 * Loads all configured RSA private keys from file paths.
 * Reads NAVAL_RSA_PRIVATE_KEY_PATH_0, _1, _2, ... from environment.
 *
 * @returns {Array<string>} Array of PEM-encoded private keys
 */
function loadPrivateKeys() {
    const keys = []
    for (let i = 0; ; i++) {
        const path = process.env[`NAVAL_RSA_PRIVATE_KEY_PATH_${i}`]
        if (!path) break
        if (fs.existsSync(path)) {
            keys.push(fs.readFileSync(path, "utf8"))
        } else {
            console.warn(`RSA private key file not found: ${path}`)
        }
    }
    if (keys.length === 0) {
        console.warn("No RSA private keys configured!")
    }
    return keys
}

/**
 * Loads HMAC token signing secret from file.
 * Reads NAVAL_TOKEN_SECRET_PATH from environment.
 *
 * @returns {Buffer} Secret key bytes
 */
function loadTokenSecret() {
    const path = process.env.NAVAL_TOKEN_SECRET_PATH
    if (!path) {
        console.warn("NAVAL_TOKEN_SECRET_PATH not configured!")
        return Buffer.alloc(32)
    }
    if (!fs.existsSync(path)) {
        console.warn(`Token secret file not found: ${path}`)
        return Buffer.alloc(32)
    }
    const base64 = fs.readFileSync(path, "utf8").trim()
    return Buffer.from(base64, "base64")
}

// Load keys at module initialization
const RSA_PRIVATE_KEYS = loadPrivateKeys()
const TOKEN_SECRET = loadTokenSecret()

/**
 * Returns the number of configured private keys.
 *
 * @returns {number} Key count
 */
function getKeyCount() {
    return RSA_PRIVATE_KEYS.length
}

/**
 * Parses binary handshake request.
 * Format: [2 byte sig][1 byte ver][1 byte keyIdx][2 byte len][RSA-encrypted data]
 *
 * @param {Buffer} body - Raw binary request
 * @returns {{ keyIndex: number, encrypted: Buffer }}
 * @throws {Error} If format is invalid
 */
function parseHandshakeRequest(body) {
    if (!Buffer.isBuffer(body) || body.length < 6) {
        throw new Error("Handshake too short")
    }

    const sig = (body[0] << 8) | body[1]
    if (sig !== HANDSHAKE_SIGNATURE) {
        throw new Error("Invalid handshake signature")
    }

    const version = body[2]
    if (version !== HANDSHAKE_VERSION) {
        throw new Error(`Unsupported handshake version: ${version}`)
    }

    const keyIndex = body[3]
    const length = (body[4] << 8) | body[5]

    if (body.length !== 6 + length) {
        throw new Error("Handshake length mismatch")
    }

    const encrypted = body.slice(6)
    return { keyIndex, encrypted }
}

/**
 * Decrypts RSA-encrypted data (from handshake).
 * Tries OAEP (SHA-256) first for existing Android clients,
 * falls back to PKCS1v1.5 for iOS/newer clients.
 *
 * @param {Buffer} encrypted - RSA ciphertext
 * @param {number} keyIndex - Index of the private key to use
 * @returns {Buffer} Decrypted plaintext (JSON string as bytes)
 * @throws {Error} If key index is invalid or decryption fails
 */
function rsaDecrypt(encrypted, keyIndex = 0) {
    if (keyIndex < 0 || keyIndex >= RSA_PRIVATE_KEYS.length) {
        throw new Error(`Invalid key index: ${keyIndex}`)
    }

    const key = RSA_PRIVATE_KEYS[keyIndex]

    // Try PKCS1v1.5 first (current clients), validate JSON
    try {
        const result = crypto.privateDecrypt(
            {
                key,
                padding: crypto.constants.RSA_PKCS1_PADDING,
            },
            encrypted
        )
        JSON.parse(result.toString("utf8"))
        return result
    } catch (_) {
        // Fall back to OAEP SHA-256 (legacy Android clients)
        return crypto.privateDecrypt(
            {
                key,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: "sha256",
            },
            encrypted
        )
    }
}

/**
 * Decrypts AES-256-GCM data.
 * Java appends the 16-byte tag to ciphertext, so we split it.
 *
 * @param {Buffer} key - 32-byte AES key
 * @param {Buffer} iv - 12-byte IV
 * @param {Buffer} ciphertextWithTag - Ciphertext with 16-byte tag appended
 * @returns {Buffer} Decrypted plaintext
 */
function aesGcmDecrypt(key, iv, ciphertextWithTag) {
    const tag = ciphertextWithTag.slice(-16)
    const ciphertext = ciphertextWithTag.slice(0, -16)

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)

    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

/**
 * Encrypts data with AES-256-GCM.
 * Appends 16-byte tag to ciphertext (Java-compatible format).
 *
 * @param {Buffer} key - 32-byte AES key
 * @param {Buffer} plaintext - Data to encrypt
 * @returns {{ iv: Buffer, ciphertext: Buffer }} IV and ciphertext+tag
 */
function aesGcmEncrypt(key, plaintext) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const tag = cipher.getAuthTag()

    return {
        iv,
        ciphertext: Buffer.concat([encrypted, tag]),
    }
}

/**
 * Generates a 32-byte binary device token.
 * Token is associated with device (not user).
 *
 * Structure (32 bytes):
 *   [20 bytes: random][4 bytes: expiry][8 bytes: HMAC]
 *
 * @param {number} expirySeconds - Token lifetime (default 4 hours)
 * @returns {Buffer} 32-byte token
 */
function generateDeviceToken(expirySeconds = 4 * 60 * 60) {
    const token = Buffer.alloc(32)

    // Random prefix (20 bytes)
    crypto.randomBytes(20).copy(token, 0)

    // Expiry timestamp (4 bytes, big-endian)
    const expiry = Math.floor(Date.now() / 1000) + expirySeconds
    token.writeUInt32BE(expiry, 20)

    // HMAC of first 24 bytes (8 bytes)
    const hmac = crypto
        .createHmac("sha256", TOKEN_SECRET)
        .update(token.slice(0, 24))
        .digest()
        .slice(0, 8)
    hmac.copy(token, 24)

    return token
}

/**
 * Validates a binary device token (no DB lookup needed).
 *
 * @param {Buffer} token - 32-byte binary token
 * @returns {{ valid: boolean, expired?: boolean }}
 */
function validateDeviceToken(token) {
    if (!Buffer.isBuffer(token) || token.length !== 32) {
        return { valid: false }
    }

    // Verify HMAC
    const expectedHmac = crypto
        .createHmac("sha256", TOKEN_SECRET)
        .update(token.slice(0, 24))
        .digest()
        .slice(0, 8)

    if (!crypto.timingSafeEqual(token.slice(24, 32), expectedHmac)) {
        return { valid: false }
    }

    // Check expiry
    const expiry = token.readUInt32BE(20)
    if (Date.now() / 1000 > expiry) {
        return { valid: false, expired: true }
    }

    return { valid: true }
}

/**
 * Converts binary token to base64 for JSON/DB storage.
 *
 * @param {Buffer} token - 32-byte binary token
 * @returns {string} Base64-encoded token
 */
function tokenToBase64(token) {
    return token.toString("base64")
}

/**
 * Converts base64 token back to binary.
 *
 * @param {string} base64Token - Base64-encoded token
 * @returns {Buffer} 32-byte binary token
 */
function tokenFromBase64(base64Token) {
    return Buffer.from(base64Token, "base64")
}

/**
 * Determines the client platform from the RSA key index used during handshake.
 * Keys 0-3 are assigned to Android, keys 4-7 to iOS.
 *
 * @param {number} keyIndex - RSA key index from handshake
 * @returns {string} "android", "ios", or "unknown"
 */
function getPlatformForKeyIndex(keyIndex) {
    if (keyIndex >= 0 && keyIndex <= 3) return "android"
    if (keyIndex >= 4 && keyIndex <= 7) return "ios"
    return "unknown"
}

module.exports = {
    HANDSHAKE_SIGNATURE,
    HANDSHAKE_VERSION,
    loadPrivateKeys,
    loadTokenSecret,
    getKeyCount,
    parseHandshakeRequest,
    rsaDecrypt,
    aesGcmDecrypt,
    aesGcmEncrypt,
    generateDeviceToken,
    validateDeviceToken,
    tokenToBase64,
    tokenFromBase64,
    getPlatformForKeyIndex,
}
