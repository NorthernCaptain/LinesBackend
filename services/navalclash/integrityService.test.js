/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { LICENSE } = require("./constants")

// Mock googleapis
jest.mock("googleapis", () => {
    const mockDecodeIntegrityToken = jest.fn()
    return {
        google: {
            auth: {
                GoogleAuth: jest.fn().mockImplementation(() => ({})),
            },
            playintegrity: jest.fn().mockReturnValue({
                v1: {
                    decodeIntegrityToken: mockDecodeIntegrityToken,
                },
            }),
        },
        __mockDecodeIntegrityToken: mockDecodeIntegrityToken,
    }
})

// Mock db module
jest.mock("../../db/navalclash", () => ({
    dbGetLicenseNonce: jest.fn(),
    dbUpdateDeviceLicenseBits: jest.fn(),
}))

const {
    dbGetLicenseNonce,
    dbUpdateDeviceLicenseBits,
} = require("../../db/navalclash")
const { __mockDecodeIntegrityToken } = require("googleapis")
const {
    verifyIntegrity,
    decodeNonce,
    buildIntegrityBits,
} = require("./integrityService")

function mockReqRes(body) {
    return {
        req: { body, requestId: "test-req" },
        res: { json: jest.fn() },
    }
}

/**
 * Encodes a nonce string as base64 (matching client behavior).
 */
function encodeNonce(nonceStr) {
    return Buffer.from(nonceStr, "utf8").toString("base64")
}

describe("integrityService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
        process.env.GOOGLE_SERVICE_ACCOUNT_PATH = "./keys/test.json"
    })

    afterEach(() => {
        delete process.env.GOOGLE_SERVICE_ACCOUNT_PATH
    })

    describe("decodeNonce", () => {
        it("should decode base64 nonce to original string", () => {
            const nonce = "1234567890"
            const encoded = Buffer.from(nonce).toString("base64")
            expect(decodeNonce(encoded)).toBe(nonce)
        })

        it("should handle URL-safe base64", () => {
            const nonce = "9007199254740991"
            const encoded = Buffer.from(nonce).toString("base64url")
            expect(decodeNonce(encoded)).toBe(nonce)
        })
    })

    describe("buildIntegrityBits", () => {
        it("should set INT_CHECKED for empty payload", () => {
            const bits = buildIntegrityBits({})
            expect(bits).toBe(LICENSE.INT_CHECKED)
        })

        it("should set INT_DEVICE_OK when device integrity met", () => {
            const bits = buildIntegrityBits({
                deviceIntegrity: {
                    deviceRecognitionVerdict: [
                        "MEETS_DEVICE_INTEGRITY",
                    ],
                },
            })
            expect(bits & LICENSE.INT_DEVICE_OK).toBeTruthy()
            expect(bits & LICENSE.INT_CHECKED).toBeTruthy()
        })

        it("should set INT_APP_RECOGNIZED when app recognized", () => {
            const bits = buildIntegrityBits({
                appIntegrity: {
                    appRecognitionVerdict: "PLAY_RECOGNIZED",
                },
            })
            expect(bits & LICENSE.INT_APP_RECOGNIZED).toBeTruthy()
        })

        it("should set INT_LICENSED when account licensed", () => {
            const bits = buildIntegrityBits({
                accountDetails: {
                    appLicensingVerdict: "LICENSED",
                },
            })
            expect(bits & LICENSE.INT_LICENSED).toBeTruthy()
        })

        it("should combine all bits for fully passing device", () => {
            const bits = buildIntegrityBits({
                deviceIntegrity: {
                    deviceRecognitionVerdict: [
                        "MEETS_DEVICE_INTEGRITY",
                    ],
                },
                appIntegrity: {
                    appRecognitionVerdict: "PLAY_RECOGNIZED",
                },
                accountDetails: {
                    appLicensingVerdict: "LICENSED",
                },
            })
            expect(bits).toBe(
                LICENSE.INT_CHECKED |
                    LICENSE.INT_DEVICE_OK |
                    LICENSE.INT_APP_RECOGNIZED |
                    LICENSE.INT_LICENSED
            )
        })

        it("should not set INT_DEVICE_OK for MEETS_BASIC_INTEGRITY only", () => {
            const bits = buildIntegrityBits({
                deviceIntegrity: {
                    deviceRecognitionVerdict: [
                        "MEETS_BASIC_INTEGRITY",
                    ],
                },
            })
            expect(bits & LICENSE.INT_DEVICE_OK).toBeFalsy()
        })
    })

    describe("verifyIntegrity", () => {
        it("should return intact if parameters missing", async () => {
            const { req, res } = mockReqRes({ did: "abc" })
            await verifyIntegrity(req, res)
            expect(res.json).toHaveBeenCalledWith({ type: "intact" })
            expect(dbUpdateDeviceLicenseBits).not.toHaveBeenCalled()
        })

        it("should return intact if service account not configured", async () => {
            delete process.env.GOOGLE_SERVICE_ACCOUNT_PATH
            // Reset cached auth by re-requiring (module caches it)
            jest.resetModules()

            // Re-require after resetting modules
            const freshModule = require("./integrityService")
            const { req, res } = mockReqRes({
                did: "abc",
                token: "tok",
            })
            await freshModule.verifyIntegrity(req, res)
            expect(res.json).toHaveBeenCalledWith({ type: "intact" })
        })

        it("should return intact if token decode fails", async () => {
            __mockDecodeIntegrityToken.mockRejectedValue(
                new Error("Invalid token")
            )
            const { req, res } = mockReqRes({
                did: "abc",
                token: "bad-token",
            })
            await verifyIntegrity(req, res)
            expect(res.json).toHaveBeenCalledWith({ type: "intact" })
        })

        it("should reject nonce mismatch", async () => {
            const nonce = "12345"
            __mockDecodeIntegrityToken.mockResolvedValue({
                data: {
                    tokenPayloadExternal: {
                        requestDetails: {
                            nonce: encodeNonce("99999"),
                        },
                        appIntegrity: {
                            packageName:
                                "northern.captain.seabattle.pro",
                        },
                    },
                },
            })
            dbGetLicenseNonce.mockResolvedValue(nonce)
            dbUpdateDeviceLicenseBits.mockResolvedValue(true)

            const { req, res } = mockReqRes({
                did: "abc",
                token: "tok",
            })
            await verifyIntegrity(req, res)
            expect(dbUpdateDeviceLicenseBits).toHaveBeenCalledWith(
                "abc",
                LICENSE.INT_MASK,
                LICENSE.INT_CHECKED
            )
        })

        it("should reject wrong package name", async () => {
            const nonce = "12345"
            __mockDecodeIntegrityToken.mockResolvedValue({
                data: {
                    tokenPayloadExternal: {
                        requestDetails: {
                            nonce: encodeNonce(nonce),
                        },
                        appIntegrity: {
                            packageName: "wrong.package",
                        },
                    },
                },
            })
            dbGetLicenseNonce.mockResolvedValue(nonce)
            dbUpdateDeviceLicenseBits.mockResolvedValue(true)

            const { req, res } = mockReqRes({
                did: "abc",
                token: "tok",
            })
            await verifyIntegrity(req, res)
            expect(dbUpdateDeviceLicenseBits).toHaveBeenCalledWith(
                "abc",
                LICENSE.INT_MASK,
                LICENSE.INT_CHECKED
            )
        })

        it("should accept valid integrity response with all verdicts", async () => {
            const nonce = "12345"
            __mockDecodeIntegrityToken.mockResolvedValue({
                data: {
                    tokenPayloadExternal: {
                        requestDetails: {
                            nonce: encodeNonce(nonce),
                        },
                        deviceIntegrity: {
                            deviceRecognitionVerdict: [
                                "MEETS_DEVICE_INTEGRITY",
                            ],
                        },
                        appIntegrity: {
                            packageName:
                                "northern.captain.seabattle.pro",
                            appRecognitionVerdict: "PLAY_RECOGNIZED",
                        },
                        accountDetails: {
                            appLicensingVerdict: "LICENSED",
                        },
                    },
                },
            })
            dbGetLicenseNonce.mockResolvedValue(nonce)
            dbUpdateDeviceLicenseBits.mockResolvedValue(true)

            const { req, res } = mockReqRes({
                did: "abc",
                token: "valid-token",
            })
            await verifyIntegrity(req, res)

            const expectedBits =
                LICENSE.INT_CHECKED |
                LICENSE.INT_DEVICE_OK |
                LICENSE.INT_APP_RECOGNIZED |
                LICENSE.INT_LICENSED
            expect(dbUpdateDeviceLicenseBits).toHaveBeenCalledWith(
                "abc",
                LICENSE.INT_MASK,
                expectedBits
            )
            expect(res.json).toHaveBeenCalledWith({ type: "intact" })
        })

        it("should set only INT_CHECKED when verdicts fail", async () => {
            const nonce = "12345"
            __mockDecodeIntegrityToken.mockResolvedValue({
                data: {
                    tokenPayloadExternal: {
                        requestDetails: {
                            nonce: encodeNonce(nonce),
                        },
                        deviceIntegrity: {
                            deviceRecognitionVerdict: [],
                        },
                        appIntegrity: {
                            packageName:
                                "northern.captain.seabattle.pro",
                            appRecognitionVerdict: "UNRECOGNIZED",
                        },
                        accountDetails: {
                            appLicensingVerdict: "UNLICENSED",
                        },
                    },
                },
            })
            dbGetLicenseNonce.mockResolvedValue(nonce)
            dbUpdateDeviceLicenseBits.mockResolvedValue(true)

            const { req, res } = mockReqRes({
                did: "abc",
                token: "tok",
            })
            await verifyIntegrity(req, res)
            expect(dbUpdateDeviceLicenseBits).toHaveBeenCalledWith(
                "abc",
                LICENSE.INT_MASK,
                LICENSE.INT_CHECKED
            )
        })
    })
})
