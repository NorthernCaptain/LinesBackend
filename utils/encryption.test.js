/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const crypto = require("crypto")
const fs = require("fs")
const path = require("path")

// Generate a test RSA key pair for testing
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
})

const privatePem = privateKey.export({ type: "pkcs1", format: "pem" })
const publicDer = publicKey.export({ type: "spki", format: "der" })

// Write test key to temp file and set env vars before requiring module
const tmpDir = path.join(__dirname, "../tmp/test-keys")
fs.mkdirSync(tmpDir, { recursive: true })
fs.writeFileSync(path.join(tmpDir, "test_private_v1.pem"), privatePem)

const tokenSecret = crypto.randomBytes(32).toString("base64")
fs.writeFileSync(path.join(tmpDir, "test_token_secret.txt"), tokenSecret)

process.env.NAVAL_RSA_PRIVATE_KEY_PATH_0 = path.join(
    tmpDir,
    "test_private_v1.pem"
)
process.env.NAVAL_TOKEN_SECRET_PATH = path.join(tmpDir, "test_token_secret.txt")

const {
    HANDSHAKE_SIGNATURE,
    HANDSHAKE_VERSION,
    getKeyCount,
    parseHandshakeRequest,
    rsaDecrypt,
    aesGcmDecrypt,
    aesGcmEncrypt,
    generateDeviceToken,
    validateDeviceToken,
    tokenToBase64,
    tokenFromBase64,
} = require("./encryption")

afterAll(() => {
    // Clean up temp files
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.NAVAL_RSA_PRIVATE_KEY_PATH_0
    delete process.env.NAVAL_TOKEN_SECRET_PATH
})

describe("utils/encryption", () => {
    describe("getKeyCount", () => {
        it("should return 1 configured key", () => {
            expect(getKeyCount()).toBe(1)
        })
    })

    describe("parseHandshakeRequest", () => {
        it("should parse valid handshake binary", () => {
            const encrypted = Buffer.from("test-encrypted-data")
            const header = Buffer.alloc(6)
            header.writeUInt16BE(HANDSHAKE_SIGNATURE, 0)
            header.writeUInt8(HANDSHAKE_VERSION, 2)
            header.writeUInt8(0, 3) // key index
            header.writeUInt16BE(encrypted.length, 4)

            const body = Buffer.concat([header, encrypted])
            const result = parseHandshakeRequest(body)

            expect(result.keyIndex).toBe(0)
            expect(result.encrypted).toEqual(encrypted)
        })

        it("should reject body too short", () => {
            expect(() => parseHandshakeRequest(Buffer.alloc(5))).toThrow(
                "Handshake too short"
            )
        })

        it("should reject non-buffer input", () => {
            expect(() => parseHandshakeRequest("not-a-buffer")).toThrow(
                "Handshake too short"
            )
        })

        it("should reject invalid signature", () => {
            const body = Buffer.alloc(10)
            body.writeUInt16BE(0x1234, 0) // wrong signature
            expect(() => parseHandshakeRequest(body)).toThrow(
                "Invalid handshake signature"
            )
        })

        it("should reject unsupported version", () => {
            const body = Buffer.alloc(10)
            body.writeUInt16BE(HANDSHAKE_SIGNATURE, 0)
            body.writeUInt8(0x99, 2) // wrong version
            expect(() => parseHandshakeRequest(body)).toThrow(
                "Unsupported handshake version"
            )
        })

        it("should reject length mismatch", () => {
            const header = Buffer.alloc(6)
            header.writeUInt16BE(HANDSHAKE_SIGNATURE, 0)
            header.writeUInt8(HANDSHAKE_VERSION, 2)
            header.writeUInt8(0, 3)
            header.writeUInt16BE(100, 4) // claims 100 bytes

            const body = Buffer.concat([header, Buffer.alloc(50)]) // only 50
            expect(() => parseHandshakeRequest(body)).toThrow(
                "Handshake length mismatch"
            )
        })
    })

    describe("rsaDecrypt", () => {
        it("should decrypt RSA-OAEP encrypted data", () => {
            const plaintext = Buffer.from('{"key":"test","uuid":"abc"}')
            const encrypted = crypto.publicEncrypt(
                {
                    key: publicKey,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: "sha256",
                },
                plaintext
            )

            const result = rsaDecrypt(encrypted, 0)
            expect(result.toString("utf8")).toBe(plaintext.toString("utf8"))
        })

        it("should reject invalid key index", () => {
            expect(() => rsaDecrypt(Buffer.alloc(256), 99)).toThrow(
                "Invalid key index"
            )
        })

        it("should reject negative key index", () => {
            expect(() => rsaDecrypt(Buffer.alloc(256), -1)).toThrow(
                "Invalid key index"
            )
        })
    })

    describe("AES-GCM roundtrip", () => {
        it("should encrypt and decrypt correctly", () => {
            const key = crypto.randomBytes(32)
            const plaintext = Buffer.from('{"type":"connect","player":"Test"}')

            const { iv, ciphertext } = aesGcmEncrypt(key, plaintext)

            expect(iv.length).toBe(12)
            expect(ciphertext.length).toBe(plaintext.length + 16) // +16 for tag

            const decrypted = aesGcmDecrypt(key, iv, ciphertext)
            expect(decrypted.toString("utf8")).toBe(plaintext.toString("utf8"))
        })

        it("should fail with wrong key", () => {
            const key = crypto.randomBytes(32)
            const wrongKey = crypto.randomBytes(32)
            const plaintext = Buffer.from("test data")

            const { iv, ciphertext } = aesGcmEncrypt(key, plaintext)

            expect(() => aesGcmDecrypt(wrongKey, iv, ciphertext)).toThrow()
        })

        it("should fail with tampered ciphertext", () => {
            const key = crypto.randomBytes(32)
            const plaintext = Buffer.from("test data")

            const { iv, ciphertext } = aesGcmEncrypt(key, plaintext)

            // Tamper with ciphertext
            ciphertext[0] ^= 0xff

            expect(() => aesGcmDecrypt(key, iv, ciphertext)).toThrow()
        })
    })

    describe("device tokens", () => {
        it("should generate valid 32-byte token", () => {
            const token = generateDeviceToken()
            expect(token.length).toBe(32)
        })

        it("should validate freshly generated token", () => {
            const token = generateDeviceToken()
            const result = validateDeviceToken(token)
            expect(result.valid).toBe(true)
        })

        it("should reject non-buffer input", () => {
            const result = validateDeviceToken("not-a-buffer")
            expect(result.valid).toBe(false)
        })

        it("should reject wrong length buffer", () => {
            const result = validateDeviceToken(Buffer.alloc(16))
            expect(result.valid).toBe(false)
        })

        it("should reject tampered token", () => {
            const token = generateDeviceToken()
            token[0] ^= 0xff // tamper with random prefix
            const result = validateDeviceToken(token)
            expect(result.valid).toBe(false)
        })

        it("should reject expired token", () => {
            const token = generateDeviceToken(-1) // already expired
            const result = validateDeviceToken(token)
            expect(result.valid).toBe(false)
            expect(result.expired).toBe(true)
        })

        it("should roundtrip through base64", () => {
            const token = generateDeviceToken()
            const base64 = tokenToBase64(token)
            const restored = tokenFromBase64(base64)

            expect(restored).toEqual(token)
            expect(base64.length).toBe(44)
        })
    })

    describe("full handshake flow", () => {
        it("should parse, decrypt, and validate a complete handshake", () => {
            const aesKey = crypto.randomBytes(32)
            const payload = JSON.stringify({
                key: aesKey.toString("base64"),
                uuid: "test-device-uuid",
                uuuid: "test-user-uuid",
                v: 26,
                p: "android",
            })

            // RSA encrypt the payload
            const encrypted = crypto.publicEncrypt(
                {
                    key: publicKey,
                    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                    oaepHash: "sha256",
                },
                Buffer.from(payload, "utf8")
            )

            // Build binary handshake
            const header = Buffer.alloc(6)
            header.writeUInt16BE(HANDSHAKE_SIGNATURE, 0)
            header.writeUInt8(HANDSHAKE_VERSION, 2)
            header.writeUInt8(0, 3)
            header.writeUInt16BE(encrypted.length, 4)
            const body = Buffer.concat([header, encrypted])

            // Parse and decrypt
            const { keyIndex, encrypted: enc } = parseHandshakeRequest(body)
            expect(keyIndex).toBe(0)

            const decrypted = rsaDecrypt(enc, keyIndex)
            const parsed = JSON.parse(decrypted.toString("utf8"))

            expect(parsed.uuid).toBe("test-device-uuid")
            expect(parsed.uuuid).toBe("test-user-uuid")
            expect(parsed.v).toBe(26)
            expect(parsed.p).toBe("android")

            const restoredKey = Buffer.from(parsed.key, "base64")
            expect(restoredKey).toEqual(aesKey)
        })
    })
})
