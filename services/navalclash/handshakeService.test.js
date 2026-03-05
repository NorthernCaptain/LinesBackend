/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const crypto = require("crypto")

// Mock encryption module
const mockParseHandshakeRequest = jest.fn()
const mockRsaDecrypt = jest.fn()
const mockAesGcmEncrypt = jest.fn()
const mockGenerateDeviceToken = jest.fn()
const mockTokenToBase64 = jest.fn()
const mockGetPlatformForKeyIndex = jest.fn()

jest.mock("../../utils/encryption", () => ({
    parseHandshakeRequest: mockParseHandshakeRequest,
    rsaDecrypt: mockRsaDecrypt,
    aesGcmEncrypt: mockAesGcmEncrypt,
    generateDeviceToken: mockGenerateDeviceToken,
    tokenToBase64: mockTokenToBase64,
    getPlatformForKeyIndex: mockGetPlatformForKeyIndex,
}))

// Mock DB
const mockDbStoreDeviceKey = jest.fn()
jest.mock("../../db/navalclash/keys", () => ({
    dbStoreDeviceKey: mockDbStoreDeviceKey,
}))

// Mock logger
jest.mock("../../utils/logger", () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}))

const { handshake } = require("./handshakeService")

describe("handshakeService", () => {
    let req, res

    beforeEach(() => {
        jest.clearAllMocks()

        req = {
            body: Buffer.alloc(262), // big enough binary body
        }
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
        }
    })

    it("should return 400 when parse fails", async () => {
        mockParseHandshakeRequest.mockImplementation(() => {
            throw new Error("Handshake too short")
        })

        await handshake(req, res)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({ error: "PROTOCOL_ERROR" })
    })

    it("should return 400 when RSA decrypt fails", async () => {
        mockParseHandshakeRequest.mockReturnValue({
            keyIndex: 0,
            encrypted: Buffer.alloc(256),
        })
        mockRsaDecrypt.mockImplementation(() => {
            throw new Error("Decryption failed")
        })

        await handshake(req, res)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({ error: "PROTOCOL_ERROR" })
    })

    it("should return 400 when uuid is missing", async () => {
        const payload = JSON.stringify({
            key: crypto.randomBytes(32).toString("base64"),
            // uuid missing
        })

        mockParseHandshakeRequest.mockReturnValue({
            keyIndex: 0,
            encrypted: Buffer.alloc(256),
        })
        mockRsaDecrypt.mockReturnValue(Buffer.from(payload))

        await handshake(req, res)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({ error: "PROTOCOL_ERROR" })
    })

    it("should return 400 when key is missing", async () => {
        const payload = JSON.stringify({
            uuid: "test-uuid",
            // key missing
        })

        mockParseHandshakeRequest.mockReturnValue({
            keyIndex: 0,
            encrypted: Buffer.alloc(256),
        })
        mockRsaDecrypt.mockReturnValue(Buffer.from(payload))

        await handshake(req, res)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({ error: "PROTOCOL_ERROR" })
    })

    it("should return 400 when key is wrong length", async () => {
        const payload = JSON.stringify({
            key: Buffer.from("short").toString("base64"),
            uuid: "test-uuid",
        })

        mockParseHandshakeRequest.mockReturnValue({
            keyIndex: 0,
            encrypted: Buffer.alloc(256),
        })
        mockRsaDecrypt.mockReturnValue(Buffer.from(payload))

        await handshake(req, res)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({ error: "PROTOCOL_ERROR" })
    })

    it("should derive ios platform for key index 5", async () => {
        const aesKey = crypto.randomBytes(32)
        const payload = JSON.stringify({
            key: aesKey.toString("base64"),
            uuid: "ios-device",
            v: 26,
            p: "ios",
        })
        const token = crypto.randomBytes(32)

        mockParseHandshakeRequest.mockReturnValue({
            keyIndex: 5,
            encrypted: Buffer.alloc(256),
        })
        mockRsaDecrypt.mockReturnValue(Buffer.from(payload))
        mockGetPlatformForKeyIndex.mockReturnValue("ios")
        mockGenerateDeviceToken.mockReturnValue(token)
        mockTokenToBase64.mockReturnValue("ios-token-b64")
        mockDbStoreDeviceKey.mockResolvedValue(true)
        mockAesGcmEncrypt.mockReturnValue({
            iv: crypto.randomBytes(12),
            ciphertext: Buffer.from("encrypted"),
        })

        await handshake(req, res)

        expect(mockGetPlatformForKeyIndex).toHaveBeenCalledWith(5)
        expect(mockDbStoreDeviceKey).toHaveBeenCalledWith(
            "ios-token-b64",
            aesKey,
            "ios-device",
            4 * 60 * 60,
            "ios"
        )
    })

    it("should return 500 when DB store fails", async () => {
        const aesKey = crypto.randomBytes(32)
        const payload = JSON.stringify({
            key: aesKey.toString("base64"),
            uuid: "test-uuid",
            uuuid: "user-uuid",
            v: 26,
            p: "android",
        })
        const token = crypto.randomBytes(32)

        mockParseHandshakeRequest.mockReturnValue({
            keyIndex: 0,
            encrypted: Buffer.alloc(256),
        })
        mockRsaDecrypt.mockReturnValue(Buffer.from(payload))
        mockGetPlatformForKeyIndex.mockReturnValue("android")
        mockGenerateDeviceToken.mockReturnValue(token)
        mockTokenToBase64.mockReturnValue("dG9rZW4tYmFzZTY0")
        mockDbStoreDeviceKey.mockResolvedValue(false)

        await handshake(req, res)

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res.json).toHaveBeenCalledWith({ error: "PROTOCOL_ERROR" })
    })

    it("should succeed with valid handshake and derive platform", async () => {
        const aesKey = crypto.randomBytes(32)
        const payload = JSON.stringify({
            key: aesKey.toString("base64"),
            uuid: "test-device-uuid",
            uuuid: "test-user-uuid",
            v: 26,
            p: "android",
        })
        const token = crypto.randomBytes(32)
        const tokenB64 = "dG9rZW4tYmFzZTY0AAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        const respIv = crypto.randomBytes(12)
        const respCiphertext = Buffer.from("encrypted-response")

        mockParseHandshakeRequest.mockReturnValue({
            keyIndex: 2,
            encrypted: Buffer.alloc(256),
        })
        mockRsaDecrypt.mockReturnValue(Buffer.from(payload))
        mockGetPlatformForKeyIndex.mockReturnValue("android")
        mockGenerateDeviceToken.mockReturnValue(token)
        mockTokenToBase64.mockReturnValue(tokenB64)
        mockDbStoreDeviceKey.mockResolvedValue(true)
        mockAesGcmEncrypt.mockReturnValue({
            iv: respIv,
            ciphertext: respCiphertext,
        })

        await handshake(req, res)

        // Verify platform was derived from key index
        expect(mockGetPlatformForKeyIndex).toHaveBeenCalledWith(2)

        // Verify DB store was called with platform
        expect(mockDbStoreDeviceKey).toHaveBeenCalledWith(
            tokenB64,
            aesKey,
            "test-device-uuid",
            4 * 60 * 60,
            "android"
        )

        // Verify AES encrypt was called with correct response
        expect(mockAesGcmEncrypt).toHaveBeenCalledWith(
            aesKey,
            expect.any(Buffer)
        )

        // Verify the plaintext passed to encrypt contains the token
        const encryptCall = mockAesGcmEncrypt.mock.calls[0]
        const responsePlaintext = JSON.parse(encryptCall[1].toString("utf8"))
        expect(responsePlaintext.type).toBe("ok")
        expect(responsePlaintext.dt).toBe(tokenB64)

        // Verify binary response
        expect(res.set).toHaveBeenCalledWith(
            "Content-Type",
            "application/octet-stream"
        )
        expect(res.send).toHaveBeenCalledWith(
            Buffer.concat([respIv, respCiphertext])
        )
    })
})
