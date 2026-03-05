/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

jest.mock("./pool", () => {
    const execute = jest.fn()
    return {
        pool: { execute },
    }
})

const { pool } = require("./pool")
const {
    dbSaveLicenseNonce,
    dbGetLicenseNonce,
    dbUpdateDeviceLicense,
} = require("./licenses")

describe("licenses db functions", () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe("dbSaveLicenseNonce", () => {
        it("should save nonce for device", async () => {
            pool.execute.mockResolvedValue([{ affectedRows: 1 }])
            const result = await dbSaveLicenseNonce("device123", 99999n)
            expect(result).toBe(true)
            expect(pool.execute).toHaveBeenCalledWith(
                "UPDATE devices SET license_nonce = ? WHERE android_id = ?",
                ["99999", "device123"]
            )
        })

        it("should return false on error", async () => {
            pool.execute.mockRejectedValue(new Error("db error"))
            const result = await dbSaveLicenseNonce("device123", 99999n)
            expect(result).toBe(false)
        })
    })

    describe("dbGetLicenseNonce", () => {
        it("should return nonce as string", async () => {
            pool.execute.mockResolvedValue([[{ license_nonce: 12345n }]])
            const result = await dbGetLicenseNonce("device123")
            expect(result).toBe("12345")
        })

        it("should return null if no device found", async () => {
            pool.execute.mockResolvedValue([[]])
            const result = await dbGetLicenseNonce("device123")
            expect(result).toBeNull()
        })

        it("should return null if nonce is null", async () => {
            pool.execute.mockResolvedValue([[{ license_nonce: null }]])
            const result = await dbGetLicenseNonce("device123")
            expect(result).toBeNull()
        })

        it("should return null on error", async () => {
            pool.execute.mockRejectedValue(new Error("db error"))
            const result = await dbGetLicenseNonce("device123")
            expect(result).toBeNull()
        })
    })

    describe("dbUpdateDeviceLicense", () => {
        it("should update license status and clear nonce", async () => {
            pool.execute.mockResolvedValue([{ affectedRows: 1 }])
            const result = await dbUpdateDeviceLicense("device123", 1)
            expect(result).toBe(true)
            expect(pool.execute).toHaveBeenCalledWith(
                expect.stringContaining("license_status"),
                [1, "device123"]
            )
        })

        it("should return false on error", async () => {
            pool.execute.mockRejectedValue(new Error("db error"))
            const result = await dbUpdateDeviceLicense("device123", 1)
            expect(result).toBe(false)
        })
    })
})
