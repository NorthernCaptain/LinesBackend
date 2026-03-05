/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const crypto = require("crypto")

// Mock dependencies before requiring module
const mockValidateDeviceToken = jest.fn()
const mockTokenToBase64 = jest.fn()
const mockAesGcmDecrypt = jest.fn()
const mockAesGcmEncrypt = jest.fn()
const mockDbGetDeviceKey = jest.fn()

jest.mock("../utils/encryption", () => ({
    validateDeviceToken: mockValidateDeviceToken,
    tokenToBase64: mockTokenToBase64,
    aesGcmDecrypt: mockAesGcmDecrypt,
    aesGcmEncrypt: mockAesGcmEncrypt,
}))

jest.mock("../db/navalclash/keys", () => ({
    dbGetDeviceKey: mockDbGetDeviceKey,
}))

jest.mock("../utils/logger", () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}))

const {
    navalEncryption,
    parseBinaryRequest,
    buildBinaryResponse,
} = require("./navalEncryption")

describe("parseBinaryRequest", () => {
    it("should parse valid binary request", () => {
        const token = crypto.randomBytes(32)
        const iv = crypto.randomBytes(12)
        const ciphertext = crypto.randomBytes(33) // 16 tag + 17 data

        const body = Buffer.concat([token, iv, ciphertext])
        const result = parseBinaryRequest(body)

        expect(result.token).toEqual(token)
        expect(result.iv).toEqual(iv)
        expect(result.ciphertext).toEqual(ciphertext)
    })

    it("should reject body too short", () => {
        expect(() => parseBinaryRequest(Buffer.alloc(60))).toThrow(
            "Request too short"
        )
    })

    it("should reject non-buffer input", () => {
        expect(() => parseBinaryRequest("not-a-buffer")).toThrow(
            "Request too short"
        )
    })

    it("should accept minimum valid length (61 bytes)", () => {
        const body = Buffer.alloc(61)
        const result = parseBinaryRequest(body)
        expect(result.token.length).toBe(32)
        expect(result.iv.length).toBe(12)
        expect(result.ciphertext.length).toBe(17)
    })
})

describe("buildBinaryResponse", () => {
    it("should concatenate IV and ciphertext", () => {
        const iv = Buffer.from("123456789012") // 12 bytes
        const ciphertext = Buffer.from("encrypted-data-with-tag")

        const result = buildBinaryResponse(iv, ciphertext)

        expect(result.length).toBe(iv.length + ciphertext.length)
        expect(result.slice(0, 12)).toEqual(iv)
        expect(result.slice(12)).toEqual(ciphertext)
    })
})

describe("navalEncryption middleware", () => {
    let req, res, next

    beforeEach(() => {
        jest.clearAllMocks()

        req = {
            body: null,
        }
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
        }
        next = jest.fn()
    })

    it("should return 400 for body too short", async () => {
        req.body = Buffer.alloc(10)

        await navalEncryption(req, res, next)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({ error: "PROTOCOL_ERROR" })
        expect(next).not.toHaveBeenCalled()
    })

    it("should return 401 for invalid token HMAC", async () => {
        req.body = Buffer.alloc(100)
        mockValidateDeviceToken.mockReturnValue({ valid: false })

        await navalEncryption(req, res, next)

        expect(res.status).toHaveBeenCalledWith(401)
        expect(res.json).toHaveBeenCalledWith({ error: "PROTOCOL_ERROR" })
        expect(next).not.toHaveBeenCalled()
    })

    it("should return 401 TOKEN_EXPIRED for expired token", async () => {
        req.body = Buffer.alloc(100)
        mockValidateDeviceToken.mockReturnValue({
            valid: false,
            expired: true,
        })

        await navalEncryption(req, res, next)

        expect(res.status).toHaveBeenCalledWith(401)
        expect(res.json).toHaveBeenCalledWith({ error: "TOKEN_EXPIRED" })
        expect(next).not.toHaveBeenCalled()
    })

    it("should return 401 when token not in DB", async () => {
        req.body = Buffer.alloc(100)
        mockValidateDeviceToken.mockReturnValue({ valid: true })
        mockTokenToBase64.mockReturnValue("dGVzdC10b2tlbi1iYXNlNjQ=")
        mockDbGetDeviceKey.mockResolvedValue(null)

        await navalEncryption(req, res, next)

        expect(res.status).toHaveBeenCalledWith(401)
        expect(res.json).toHaveBeenCalledWith({ error: "PROTOCOL_ERROR" })
        expect(next).not.toHaveBeenCalled()
    })

    it("should return 400 on decrypt failure", async () => {
        req.body = Buffer.alloc(100)
        const aesKey = crypto.randomBytes(32)

        mockValidateDeviceToken.mockReturnValue({ valid: true })
        mockTokenToBase64.mockReturnValue("token-b64")
        mockDbGetDeviceKey.mockResolvedValue({
            key: aesKey,
            deviceUuid: "test-uuid",
        })
        mockAesGcmDecrypt.mockImplementation(() => {
            throw new Error("Decryption failed")
        })

        await navalEncryption(req, res, next)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({ error: "PROTOCOL_ERROR" })
        expect(next).not.toHaveBeenCalled()
    })

    it("should decrypt request and call next on success", async () => {
        const aesKey = crypto.randomBytes(32)
        const decryptedPayload = { type: "connect", player: "TestPlayer" }

        req.body = Buffer.alloc(100)

        mockValidateDeviceToken.mockReturnValue({ valid: true })
        mockTokenToBase64.mockReturnValue("token-b64")
        mockDbGetDeviceKey.mockResolvedValue({
            key: aesKey,
            deviceUuid: "device-123",
            platform: "android",
        })
        mockAesGcmDecrypt.mockReturnValue(
            Buffer.from(JSON.stringify(decryptedPayload))
        )

        await navalEncryption(req, res, next)

        expect(req.body).toEqual(decryptedPayload)
        expect(req.navalDeviceUuid).toBe("device-123")
        expect(req.navalKey).toEqual(aesKey)
        expect(req.navalPlatform).toBe("android")
        expect(next).toHaveBeenCalled()
    })

    it("should set navalPlatform to unknown when platform is null", async () => {
        const aesKey = crypto.randomBytes(32)
        const decryptedPayload = { type: "connect" }

        req.body = Buffer.alloc(100)

        mockValidateDeviceToken.mockReturnValue({ valid: true })
        mockTokenToBase64.mockReturnValue("token-b64")
        mockDbGetDeviceKey.mockResolvedValue({
            key: aesKey,
            deviceUuid: "device-456",
            platform: null,
        })
        mockAesGcmDecrypt.mockReturnValue(
            Buffer.from(JSON.stringify(decryptedPayload))
        )

        await navalEncryption(req, res, next)

        expect(req.navalPlatform).toBe("unknown")
        expect(next).toHaveBeenCalled()
    })

    it("should override res.json to send encrypted binary", async () => {
        const aesKey = crypto.randomBytes(32)
        const decryptedPayload = { type: "connect" }
        const respIv = crypto.randomBytes(12)
        const respCiphertext = Buffer.from("encrypted-response")

        req.body = Buffer.alloc(100)

        mockValidateDeviceToken.mockReturnValue({ valid: true })
        mockTokenToBase64.mockReturnValue("token-b64")
        mockDbGetDeviceKey.mockResolvedValue({
            key: aesKey,
            deviceUuid: "device-123",
            platform: "ios",
        })
        mockAesGcmDecrypt.mockReturnValue(
            Buffer.from(JSON.stringify(decryptedPayload))
        )
        mockAesGcmEncrypt.mockReturnValue({
            iv: respIv,
            ciphertext: respCiphertext,
        })

        await navalEncryption(req, res, next)

        // Call the overridden res.json
        const responseBody = { type: "ok", sid: "12345" }
        res.json(responseBody)

        expect(mockAesGcmEncrypt).toHaveBeenCalledWith(
            aesKey,
            Buffer.from(JSON.stringify(responseBody), "utf8")
        )
        expect(res.set).toHaveBeenCalledWith(
            "Content-Type",
            "application/octet-stream"
        )
        expect(res.send).toHaveBeenCalledWith(
            Buffer.concat([respIv, respCiphertext])
        )
    })
})
