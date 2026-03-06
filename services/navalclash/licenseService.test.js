/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const crypto = require("crypto")
const {
    verifySignature,
    parseResponseData,
    mapResponseCode,
    isTimestampRecent,
    generateLicenseNonce,
    verifyLicense,
    EXPECTED_PACKAGE,
    MAX_TIMESTAMP_AGE_MS,
} = require("./licenseService")
const { LICENSE } = require("./constants")

// Mock db module
jest.mock("../../db/navalclash", () => ({
    dbGetLicenseNonce: jest.fn(),
    dbUpdateDeviceLicenseBits: jest.fn(),
}))

const {
    dbGetLicenseNonce,
    dbUpdateDeviceLicenseBits,
} = require("../../db/navalclash")

// Generate a test RSA key pair for signature verification tests
let testPrivateKey, testPublicKeyBase64

beforeAll(() => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    })
    testPrivateKey = privateKey
    // Extract base64 content from PEM (strip header/footer/newlines)
    testPublicKeyBase64 = publicKey
        .replace("-----BEGIN PUBLIC KEY-----", "")
        .replace("-----END PUBLIC KEY-----", "")
        .replace(/\n/g, "")
})

function signData(data) {
    const signer = crypto.createSign("SHA1")
    signer.update(data)
    return signer.sign(testPrivateKey, "base64")
}

function recentTs() {
    return String(Date.now())
}

function mockReqRes(body) {
    return {
        req: { body, requestId: "test-req" },
        res: { json: jest.fn() },
    }
}

describe("licenseService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
        delete process.env.GOOGLE_LICENSE_PUBLIC_KEY
    })

    describe("parseResponseData", () => {
        it("should parse valid response data", () => {
            const rd =
                "0|12345|northern.captain.seabattle.pro|205|uid|1234567890:extra"
            const parsed = parseResponseData(rd)
            expect(parsed).toEqual({
                responseCode: 0,
                nonce: "12345",
                packageName: "northern.captain.seabattle.pro",
                versionCode: "205",
                userId: "uid",
                timestamp: "1234567890:extra",
            })
        })

        it("should return null for null input", () => {
            expect(parseResponseData(null)).toBeNull()
        })

        it("should return null for too few parts", () => {
            expect(parseResponseData("0|12345|pkg")).toBeNull()
        })
    })

    describe("mapResponseCode", () => {
        it("should map 0x0 to LVL_LICENSED", () => {
            expect(mapResponseCode(0x0)).toBe(LICENSE.LVL_LICENSED)
        })

        it("should map 0x1 to LVL_LICENSED", () => {
            expect(mapResponseCode(0x1)).toBe(LICENSE.LVL_LICENSED)
        })

        it("should map 0x2 to LVL_NOT_LICENSED", () => {
            expect(mapResponseCode(0x2)).toBe(LICENSE.LVL_NOT_LICENSED)
        })

        it("should map 0x3 to LVL_RETRY", () => {
            expect(mapResponseCode(0x3)).toBe(LICENSE.LVL_RETRY)
        })

        it("should map unknown codes to LVL_NOT_LICENSED", () => {
            expect(mapResponseCode(99)).toBe(LICENSE.LVL_NOT_LICENSED)
        })
    })

    describe("isTimestampRecent", () => {
        it("should accept a recent timestamp", () => {
            expect(isTimestampRecent(String(Date.now()))).toBe(true)
        })

        it("should accept a timestamp 1 hour ago", () => {
            const ts = Date.now() - 60 * 60 * 1000
            expect(isTimestampRecent(String(ts))).toBe(true)
        })

        it("should reject a timestamp older than 4 hours", () => {
            const ts = Date.now() - 5 * 60 * 60 * 1000
            expect(isTimestampRecent(String(ts))).toBe(false)
        })

        it("should handle colon-separated suffix", () => {
            expect(isTimestampRecent(Date.now() + ":extradata")).toBe(true)
        })

        it("should reject a future timestamp", () => {
            const ts = Date.now() + 60 * 60 * 1000
            expect(isTimestampRecent(String(ts))).toBe(false)
        })

        it("should return false for null", () => {
            expect(isTimestampRecent(null)).toBe(false)
        })

        it("should return false for non-numeric string", () => {
            expect(isTimestampRecent("notanumber")).toBe(false)
        })
    })

    describe("generateLicenseNonce", () => {
        it("should generate a positive number within safe integer range", () => {
            const nonce = generateLicenseNonce()
            expect(typeof nonce).toBe("number")
            expect(nonce).toBeGreaterThan(0)
            expect(nonce).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER)
        })

        it("should generate different values", () => {
            const a = generateLicenseNonce()
            const b = generateLicenseNonce()
            expect(a).not.toBe(b)
        })
    })

    describe("verifySignature", () => {
        it("should verify a valid signature", () => {
            const data = "test data"
            const sig = signData(data)
            const pem =
                "-----BEGIN PUBLIC KEY-----\n" +
                testPublicKeyBase64.match(/.{1,64}/g).join("\n") +
                "\n-----END PUBLIC KEY-----"
            expect(verifySignature(data, sig, pem)).toBe(true)
        })

        it("should reject an invalid signature", () => {
            const pem =
                "-----BEGIN PUBLIC KEY-----\n" +
                testPublicKeyBase64.match(/.{1,64}/g).join("\n") +
                "\n-----END PUBLIC KEY-----"
            expect(verifySignature("data", "badsig", pem)).toBe(false)
        })
    })

    describe("verifyLicense", () => {
        it("should return lvlack if parameters missing", async () => {
            const { req, res } = mockReqRes({ did: "abc" })
            await verifyLicense(req, res)
            expect(res.json).toHaveBeenCalledWith({ type: "lvlack" })
        })

        it("should return lvlack if public key not configured", async () => {
            const { req, res } = mockReqRes({
                did: "abc",
                rd: "data",
                sig: "sig",
                rc: 0,
            })
            await verifyLicense(req, res)
            expect(res.json).toHaveBeenCalledWith({ type: "lvlack" })
        })

        it("should reject invalid signature", async () => {
            process.env.GOOGLE_LICENSE_PUBLIC_KEY = testPublicKeyBase64
            dbUpdateDeviceLicenseBits.mockResolvedValue(true)

            const { req, res } = mockReqRes({
                did: "abc",
                rd: "0|123|pkg|1|uid|ts",
                sig: "invalid",
                rc: 0,
            })
            await verifyLicense(req, res)
            expect(dbUpdateDeviceLicenseBits).toHaveBeenCalledWith(
                "abc",
                LICENSE.LVL_MASK,
                LICENSE.LVL_NOT_LICENSED
            )
            expect(res.json).toHaveBeenCalledWith({ type: "lvlack" })
        })

        it("should reject nonce mismatch", async () => {
            process.env.GOOGLE_LICENSE_PUBLIC_KEY = testPublicKeyBase64
            const rd = `0|999|${EXPECTED_PACKAGE}|205|uid|${recentTs()}`
            const sig = signData(rd)
            dbGetLicenseNonce.mockResolvedValue("123")
            dbUpdateDeviceLicenseBits.mockResolvedValue(true)

            const { req, res } = mockReqRes({ did: "abc", rd, sig, rc: 0 })
            await verifyLicense(req, res)
            expect(dbUpdateDeviceLicenseBits).toHaveBeenCalledWith(
                "abc",
                LICENSE.LVL_MASK,
                LICENSE.LVL_NOT_LICENSED
            )
        })

        it("should reject wrong package name", async () => {
            process.env.GOOGLE_LICENSE_PUBLIC_KEY = testPublicKeyBase64
            const rd = `0|123|wrong.package|205|uid|${recentTs()}`
            const sig = signData(rd)
            dbGetLicenseNonce.mockResolvedValue("123")
            dbUpdateDeviceLicenseBits.mockResolvedValue(true)

            const { req, res } = mockReqRes({ did: "abc", rd, sig, rc: 0 })
            await verifyLicense(req, res)
            expect(dbUpdateDeviceLicenseBits).toHaveBeenCalledWith(
                "abc",
                LICENSE.LVL_MASK,
                LICENSE.LVL_NOT_LICENSED
            )
        })

        it("should reject stale timestamp", async () => {
            process.env.GOOGLE_LICENSE_PUBLIC_KEY = testPublicKeyBase64
            const staleTs = Date.now() - 5 * 60 * 60 * 1000
            const rd = `0|12345|${EXPECTED_PACKAGE}|205|uid|${staleTs}`
            const sig = signData(rd)
            dbGetLicenseNonce.mockResolvedValue("12345")
            dbUpdateDeviceLicenseBits.mockResolvedValue(true)

            const { req, res } = mockReqRes({ did: "abc", rd, sig, rc: 0 })
            await verifyLicense(req, res)
            expect(dbUpdateDeviceLicenseBits).toHaveBeenCalledWith(
                "abc",
                LICENSE.LVL_MASK,
                LICENSE.LVL_NOT_LICENSED
            )
        })

        it("should accept valid licensed response", async () => {
            process.env.GOOGLE_LICENSE_PUBLIC_KEY = testPublicKeyBase64
            const rd = `0|12345|${EXPECTED_PACKAGE}|205|uid|${recentTs()}`
            const sig = signData(rd)
            dbGetLicenseNonce.mockResolvedValue("12345")
            dbUpdateDeviceLicenseBits.mockResolvedValue(true)

            const { req, res } = mockReqRes({ did: "abc", rd, sig, rc: 0 })
            await verifyLicense(req, res)
            expect(dbUpdateDeviceLicenseBits).toHaveBeenCalledWith(
                "abc",
                LICENSE.LVL_MASK,
                LICENSE.LVL_LICENSED
            )
            expect(res.json).toHaveBeenCalledWith({ type: "lvlack" })
        })

        it("should handle NOT_LICENSED response code", async () => {
            process.env.GOOGLE_LICENSE_PUBLIC_KEY = testPublicKeyBase64
            const rd = `2|12345|${EXPECTED_PACKAGE}|205|uid|${recentTs()}`
            const sig = signData(rd)
            dbGetLicenseNonce.mockResolvedValue("12345")
            dbUpdateDeviceLicenseBits.mockResolvedValue(true)

            const { req, res } = mockReqRes({ did: "abc", rd, sig, rc: 2 })
            await verifyLicense(req, res)
            expect(dbUpdateDeviceLicenseBits).toHaveBeenCalledWith(
                "abc",
                LICENSE.LVL_MASK,
                LICENSE.LVL_NOT_LICENSED
            )
        })

        it("should handle RETRY response code", async () => {
            process.env.GOOGLE_LICENSE_PUBLIC_KEY = testPublicKeyBase64
            const rd = `3|12345|${EXPECTED_PACKAGE}|205|uid|${recentTs()}`
            const sig = signData(rd)
            dbGetLicenseNonce.mockResolvedValue("12345")
            dbUpdateDeviceLicenseBits.mockResolvedValue(true)

            const { req, res } = mockReqRes({ did: "abc", rd, sig, rc: 3 })
            await verifyLicense(req, res)
            expect(dbUpdateDeviceLicenseBits).toHaveBeenCalledWith(
                "abc",
                LICENSE.LVL_MASK,
                LICENSE.LVL_RETRY
            )
        })
    })
})
