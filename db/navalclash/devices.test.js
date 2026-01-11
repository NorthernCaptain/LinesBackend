/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockExecute = jest.fn()

jest.mock("./pool", () => ({
    pool: {
        execute: mockExecute,
    },
}))

const {
    dbFindDeviceByAndroidId,
    dbCreateDevice,
    dbUpdateDevice,
    dbLinkUserDevice,
} = require("./devices")

describe("db/navalclash/devices", () => {
    beforeEach(() => {
        mockExecute.mockReset()
    })

    describe("dbFindDeviceByAndroidId", () => {
        it("should return device when found", async () => {
            const mockDevice = { id: 1, android_id: "android123" }
            mockExecute.mockResolvedValue([[mockDevice]])

            const result = await dbFindDeviceByAndroidId("android123")

            expect(result).toEqual(mockDevice)
            expect(mockExecute).toHaveBeenCalledWith(
                "SELECT * FROM devices WHERE android_id = ?",
                ["android123"]
            )
        })

        it("should return null when not found", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbFindDeviceByAndroidId("unknown")

            expect(result).toBeNull()
        })

        it("should return null on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbFindDeviceByAndroidId("test")

            expect(result).toBeNull()
        })
    })

    describe("dbCreateDevice", () => {
        it("should create device and return insertId", async () => {
            mockExecute.mockResolvedValue([{ insertId: 99 }])

            const result = await dbCreateDevice({
                androidId: "android-id",
                device: "Pixel",
                model: "Pixel 6",
                manufacturer: "Google",
                product: "oriole",
                osVersion: "12",
                dispDpi: 420,
                dispHeight: 2400,
                dispWidth: 1080,
                dispScale: 2.625,
                dispSize: "6.4",
                appVersion: 150,
            })

            expect(result).toBe(99)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO devices"),
                [
                    "android-id",
                    "Pixel",
                    "Pixel 6",
                    "Google",
                    "oriole",
                    "12",
                    420,
                    2400,
                    1080,
                    2.625,
                    "6.4",
                    150,
                ]
            )
        })

        it("should use defaults for missing optional fields", async () => {
            mockExecute.mockResolvedValue([{ insertId: 1 }])

            await dbCreateDevice({ androidId: "test-id" })

            expect(mockExecute).toHaveBeenCalledWith(expect.any(String), [
                "test-id",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                0,
            ])
        })

        it("should return null on error", async () => {
            mockExecute.mockRejectedValue(new Error("Duplicate"))

            const result = await dbCreateDevice({ androidId: "dup" })

            expect(result).toBeNull()
        })
    })

    describe("dbUpdateDevice", () => {
        it("should update device", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbUpdateDevice(5, {
                model: "Pixel 7",
                manufacturer: "Google",
                osVersion: "13",
                appVersion: 200,
            })

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("UPDATE devices SET"),
                ["Pixel 7", "Google", "13", 200, 5]
            )
        })

        it("should return false on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbUpdateDevice(1, {})

            expect(result).toBe(false)
        })
    })

    describe("dbLinkUserDevice", () => {
        it("should link user to device", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbLinkUserDevice(1, 10)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO user_devices"),
                [1, 10]
            )
        })

        it("should return false on error", async () => {
            mockExecute.mockRejectedValue(new Error("FK violation"))

            const result = await dbLinkUserDevice(999, 999)

            expect(result).toBe(false)
        })
    })
})
