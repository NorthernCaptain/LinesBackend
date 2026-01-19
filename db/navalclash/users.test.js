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
    dbFindUserByUuidAndName,
    dbFindUserById,
    dbCreateUser,
    dbUpdateUserLogin,
    dbUpdateUserPin,
    dbIsPinTaken,
    dbUpdateUserLastDevice,
    dbUpdateLocalStats,
} = require("./users")

describe("db/navalclash/users", () => {
    beforeEach(() => {
        mockExecute.mockReset()
    })

    describe("dbFindUserByUuidAndName", () => {
        it("should return user when found", async () => {
            const mockUser = { id: 1, name: "TestPlayer", uuid: "test-uuid" }
            mockExecute.mockResolvedValue([[mockUser]])

            const result = await dbFindUserByUuidAndName(
                "test-uuid",
                "TestPlayer"
            )

            expect(result).toEqual(mockUser)
            expect(mockExecute).toHaveBeenCalledWith(
                "SELECT * FROM users WHERE uuid = ? AND name = ?",
                ["test-uuid", "TestPlayer"]
            )
        })

        it("should return null when not found", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbFindUserByUuidAndName("unknown", "Unknown")

            expect(result).toBeNull()
        })

        it("should return null on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbFindUserByUuidAndName("test", "test")

            expect(result).toBeNull()
        })
    })

    describe("dbFindUserById", () => {
        it("should return user when found", async () => {
            const mockUser = { id: 42, name: "Player" }
            mockExecute.mockResolvedValue([[mockUser]])

            const result = await dbFindUserById(42)

            expect(result).toEqual(mockUser)
            expect(mockExecute).toHaveBeenCalledWith(
                "SELECT * FROM users WHERE id = ?",
                [42]
            )
        })

        it("should return null when not found", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbFindUserById(999)

            expect(result).toBeNull()
        })
    })

    describe("dbCreateUser", () => {
        it("should create user and return insertId", async () => {
            mockExecute.mockResolvedValue([{ insertId: 123 }])

            const result = await dbCreateUser({
                name: "NewPlayer",
                uuid: "new-uuid",
                lang: "en",
                version: 100,
                gameVariant: 1,
            })

            expect(result).toBe(123)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO users"),
                ["NewPlayer", "new-uuid", "en", 100, 1]
            )
        })

        it("should use defaults for optional fields", async () => {
            mockExecute.mockResolvedValue([{ insertId: 1 }])

            await dbCreateUser({ name: "Player", uuid: "uuid" })

            expect(mockExecute).toHaveBeenCalledWith(expect.any(String), [
                "Player",
                "uuid",
                null,
                0,
                1,
            ])
        })

        it("should return null on error", async () => {
            mockExecute.mockRejectedValue(new Error("Duplicate entry"))

            const result = await dbCreateUser({ name: "Test", uuid: "test" })

            expect(result).toBeNull()
        })
    })

    describe("dbUpdateUserLogin", () => {
        it("should update login info", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbUpdateUserLogin(1, 200, 2)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("UPDATE users SET"),
                [200, 2, 1]
            )
        })

        it("should return false on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbUpdateUserLogin(1, 100, 1)

            expect(result).toBe(false)
        })
    })

    describe("dbUpdateUserPin", () => {
        it("should update PIN", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbUpdateUserPin(5, 1234)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                "UPDATE users SET pin = ? WHERE id = ?",
                [1234, 5]
            )
        })
    })

    describe("dbIsPinTaken", () => {
        it("should return true when PIN is taken", async () => {
            mockExecute.mockResolvedValue([[{ id: 2 }]])

            const result = await dbIsPinTaken("Player", 1234, 1)

            expect(result).toBe(true)
        })

        it("should return false when PIN is available", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbIsPinTaken("Player", 5678, 1)

            expect(result).toBe(false)
        })

        it("should return true on error (safe default)", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbIsPinTaken("Player", 1234, 1)

            expect(result).toBe(true)
        })
    })

    describe("dbUpdateUserLastDevice", () => {
        it("should update last device", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbUpdateUserLastDevice(1, 10)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                "UPDATE users SET last_device_id = ? WHERE id = ?",
                [10, 1]
            )
        })
    })

    describe("dbUpdateLocalStats", () => {
        it("should update local stats from client data", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const clientUser = {
                ga: [10, 5, 20, 3], // android, bt, web, passplay
                wa: [8, 3, 15, 2],
            }

            const result = await dbUpdateLocalStats(null, 1, clientUser)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("games_android = ?"),
                [10, 5, 3, 8, 3, 2, 10, 5, 3, 8, 3, 2, 1]
            )
        })

        it("should return false if ga array is missing", async () => {
            const clientUser = { wa: [1, 2, 3, 4] }

            const result = await dbUpdateLocalStats(null, 1, clientUser)

            expect(result).toBe(false)
            expect(mockExecute).not.toHaveBeenCalled()
        })

        it("should return false if wa array is missing", async () => {
            const clientUser = { ga: [1, 2, 3, 4] }

            const result = await dbUpdateLocalStats(null, 1, clientUser)

            expect(result).toBe(false)
            expect(mockExecute).not.toHaveBeenCalled()
        })

        it("should return false if clientUser is null", async () => {
            const result = await dbUpdateLocalStats(null, 1, null)

            expect(result).toBe(false)
            expect(mockExecute).not.toHaveBeenCalled()
        })

        it("should use provided connection instead of pool", async () => {
            const mockConn = {
                execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
            }

            const clientUser = {
                ga: [5, 2, 10, 1],
                wa: [3, 1, 8, 0],
            }

            const result = await dbUpdateLocalStats(mockConn, 1, clientUser)

            expect(result).toBe(true)
            expect(mockConn.execute).toHaveBeenCalled()
            expect(mockExecute).not.toHaveBeenCalled()
        })

        it("should return false on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const clientUser = {
                ga: [1, 2, 3, 4],
                wa: [1, 1, 2, 1],
            }

            const result = await dbUpdateLocalStats(null, 1, clientUser)

            expect(result).toBe(false)
        })

        it("should handle missing array indices with defaults", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const clientUser = {
                ga: [10], // only android
                wa: [8, 3], // android, bt
            }

            const result = await dbUpdateLocalStats(null, 1, clientUser)

            expect(result).toBe(true)
            // Missing indices should default to 0
            expect(mockExecute).toHaveBeenCalledWith(
                expect.any(String),
                [10, 0, 0, 8, 3, 0, 10, 0, 0, 8, 3, 0, 1]
            )
        })
    })
})
