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
    dbGetUserWeaponInventory,
    dbGetTrackedWeapons,
    dbSetTrackedWeapons,
    dbGetWeaponUsage,
    dbIncrementWeaponUsage,
    dbConsumeWeapons,
    dbGetSessionUserId,
} = require("./weapons")

describe("db/navalclash/weapons", () => {
    beforeEach(() => {
        mockExecute.mockReset()
    })

    describe("dbGetUserWeaponInventory", () => {
        it("should return weapon inventory as map", async () => {
            mockExecute.mockResolvedValue([
                [
                    { item_id: "0", quantity: 5 },
                    { item_id: "2", quantity: 3 },
                ],
            ])

            const result = await dbGetUserWeaponInventory(1)

            expect(result).toEqual({ "0": 5, "2": 3 })
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("SELECT item_id, quantity"),
                [1]
            )
        })

        it("should return empty object when no inventory", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbGetUserWeaponInventory(1)

            expect(result).toEqual({})
        })

        it("should return empty object on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbGetUserWeaponInventory(1)

            expect(result).toEqual({})
        })
    })

    describe("dbGetTrackedWeapons", () => {
        it("should return tracked weapons for player 0", async () => {
            const tracked = { "0": 2, "1": 1 }
            mockExecute.mockResolvedValue([[{ tracked }]])

            const result = await dbGetTrackedWeapons("1000", 0)

            expect(result).toEqual(tracked)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("weapons_tracked_one"),
                ["1000"]
            )
        })

        it("should return tracked weapons for player 1", async () => {
            const tracked = { "2": 3 }
            mockExecute.mockResolvedValue([[{ tracked }]])

            const result = await dbGetTrackedWeapons("1000", 1)

            expect(result).toEqual(tracked)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("weapons_tracked_two"),
                ["1000"]
            )
        })

        it("should return empty object when no tracked weapons", async () => {
            mockExecute.mockResolvedValue([[{ tracked: null }]])

            const result = await dbGetTrackedWeapons("1000", 0)

            expect(result).toEqual({})
        })

        it("should return null when session not found", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbGetTrackedWeapons("9999", 0)

            expect(result).toBeNull()
        })

        it("should return null on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbGetTrackedWeapons("1000", 0)

            expect(result).toBeNull()
        })
    })

    describe("dbSetTrackedWeapons", () => {
        it("should set tracked weapons for player 0", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const weapons = { "0": 2, "2": 1 }
            const result = await dbSetTrackedWeapons("1000", 0, weapons)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("weapons_tracked_one"),
                [JSON.stringify(weapons), "1000"]
            )
        })

        it("should set tracked weapons for player 1", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const weapons = { "1": 1 }
            const result = await dbSetTrackedWeapons("1000", 1, weapons)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("weapons_tracked_two"),
                [JSON.stringify(weapons), "1000"]
            )
        })

        it("should return false on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbSetTrackedWeapons("1000", 0, {})

            expect(result).toBe(false)
        })
    })

    describe("dbGetWeaponUsage", () => {
        it("should return weapon usage for player 0", async () => {
            const used = { radar: 2, shuffle: 1 }
            mockExecute.mockResolvedValue([[{ used }]])

            const result = await dbGetWeaponUsage("1000", 0)

            expect(result).toEqual(used)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("weapons_used_one"),
                ["1000"]
            )
        })

        it("should return weapon usage for player 1", async () => {
            const used = { radar: 0, shuffle: 3 }
            mockExecute.mockResolvedValue([[{ used }]])

            const result = await dbGetWeaponUsage("1000", 1)

            expect(result).toEqual(used)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("weapons_used_two"),
                ["1000"]
            )
        })

        it("should return default usage when null", async () => {
            mockExecute.mockResolvedValue([[{ used: null }]])

            const result = await dbGetWeaponUsage("1000", 0)

            expect(result).toEqual({ radar: 0, shuffle: 0 })
        })

        it("should return default usage when session not found", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbGetWeaponUsage("9999", 0)

            expect(result).toEqual({ radar: 0, shuffle: 0 })
        })

        it("should return default usage on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbGetWeaponUsage("1000", 0)

            expect(result).toEqual({ radar: 0, shuffle: 0 })
        })
    })

    describe("dbIncrementWeaponUsage", () => {
        it("should increment radar usage for player 0", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbIncrementWeaponUsage("1000", 0, "radar")

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("weapons_used_one"),
                ["1000"]
            )
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("$.radar"),
                ["1000"]
            )
        })

        it("should increment shuffle usage for player 1", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbIncrementWeaponUsage("1000", 1, "shuffle")

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("weapons_used_two"),
                ["1000"]
            )
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("$.shuffle"),
                ["1000"]
            )
        })

        it("should return false on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbIncrementWeaponUsage("1000", 0, "radar")

            expect(result).toBe(false)
        })
    })

    describe("dbConsumeWeapons", () => {
        const mockConn = {
            execute: jest.fn(),
        }

        beforeEach(() => {
            mockConn.execute.mockReset()
        })

        it("should consume weapons from inventory", async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 1 }])

            const weapons = { "0": 2, "2": 1 }
            const result = await dbConsumeWeapons(1, weapons, mockConn)

            expect(result).toBe(true)
            // Should be called once per weapon type, plus one for cleanup
            expect(mockConn.execute).toHaveBeenCalledTimes(3)
            // Parameters: [count, userId, itemId]
            expect(mockConn.execute).toHaveBeenCalledWith(
                expect.stringContaining("UPDATE user_inventory"),
                [2, 1, "0"]
            )
            expect(mockConn.execute).toHaveBeenCalledWith(
                expect.stringContaining("UPDATE user_inventory"),
                [1, 1, "2"]
            )
            expect(mockConn.execute).toHaveBeenCalledWith(
                expect.stringContaining("DELETE FROM user_inventory"),
                [1]
            )
        })

        it("should skip weapons with zero count", async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 1 }])

            const weapons = { "0": 0, "2": 1 }
            const result = await dbConsumeWeapons(1, weapons, mockConn)

            expect(result).toBe(true)
            // Only one weapon update + cleanup
            expect(mockConn.execute).toHaveBeenCalledTimes(2)
        })

        it("should return false on error", async () => {
            mockConn.execute.mockRejectedValue(new Error("DB error"))

            const result = await dbConsumeWeapons(1, { "0": 1 }, mockConn)

            expect(result).toBe(false)
        })
    })

    describe("dbGetSessionUserId", () => {
        it("should return user ID for player 0", async () => {
            mockExecute.mockResolvedValue([[{ user_id: 10 }]])

            const result = await dbGetSessionUserId("1000", 0)

            expect(result).toBe(10)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("user_one_id"),
                ["1000"]
            )
        })

        it("should return user ID for player 1", async () => {
            mockExecute.mockResolvedValue([[{ user_id: 20 }]])

            const result = await dbGetSessionUserId("1000", 1)

            expect(result).toBe(20)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("user_two_id"),
                ["1000"]
            )
        })

        it("should return null when session not found", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbGetSessionUserId("9999", 0)

            expect(result).toBeNull()
        })

        it("should return null on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbGetSessionUserId("1000", 0)

            expect(result).toBeNull()
        })
    })
})
