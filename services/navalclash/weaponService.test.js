/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

jest.mock("../../db/navalclash/weapons", () => ({
    dbGetUserWeaponInventory: jest.fn(),
    dbSetTrackedWeapons: jest.fn(),
    dbGetTrackedWeapons: jest.fn(),
    dbIncrementWeaponUsage: jest.fn(),
    dbConsumeWeapons: jest.fn(),
    dbGetSessionUserId: jest.fn(),
}))

const {
    dbGetUserWeaponInventory,
    dbSetTrackedWeapons,
    dbGetTrackedWeapons,
    dbIncrementWeaponUsage,
    dbConsumeWeapons,
    dbGetSessionUserId,
} = require("../../db/navalclash/weapons")

const {
    WEAPON_CODE_TO_ID,
    WEAPON_ID_TO_NAME,
    weaponCodeToId,
    countWeaponsByType,
    validateWeaponPlacement,
    trackWeaponPlacement,
    trackRadarUsage,
    trackShuffleUsage,
    consumeLoserWeapons,
} = require("./weaponService")

describe("services/navalclash/weaponService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe("WEAPON_CODE_TO_ID", () => {
        it("should map weapon codes to IDs", () => {
            expect(WEAPON_CODE_TO_ID.wmn).toBe("0")
            expect(WEAPON_CODE_TO_ID.mine).toBe("0")
            expect(WEAPON_CODE_TO_ID.dch).toBe("1")
            expect(WEAPON_CODE_TO_ID.dutch).toBe("1")
            expect(WEAPON_CODE_TO_ID.anr).toBe("2")
            expect(WEAPON_CODE_TO_ID.radar).toBe("2")
            expect(WEAPON_CODE_TO_ID.smw).toBe("3")
            expect(WEAPON_CODE_TO_ID.shuffle).toBe("3")
            expect(WEAPON_CODE_TO_ID.sth).toBe("4")
            expect(WEAPON_CODE_TO_ID.stealth).toBe("4")
            expect(WEAPON_CODE_TO_ID.cls).toBe("5")
            expect(WEAPON_CODE_TO_ID.cshield).toBe("5")
        })
    })

    describe("WEAPON_ID_TO_NAME", () => {
        it("should map IDs to names", () => {
            expect(WEAPON_ID_TO_NAME[0]).toBe("mine")
            expect(WEAPON_ID_TO_NAME[1]).toBe("dutch")
            expect(WEAPON_ID_TO_NAME[2]).toBe("radar")
            expect(WEAPON_ID_TO_NAME[3]).toBe("shuffle")
            expect(WEAPON_ID_TO_NAME[4]).toBe("stealth")
            expect(WEAPON_ID_TO_NAME[5]).toBe("cshield")
        })
    })

    describe("weaponCodeToId", () => {
        it("should convert weapon codes to IDs", () => {
            expect(weaponCodeToId("wmn")).toBe("0")
            expect(weaponCodeToId("dch")).toBe("1")
            expect(weaponCodeToId("anr")).toBe("2")
            expect(weaponCodeToId("smw")).toBe("3")
            expect(weaponCodeToId("sth")).toBe("4")
            expect(weaponCodeToId("cls")).toBe("5")
        })

        it("should handle case insensitivity", () => {
            expect(weaponCodeToId("WMN")).toBe("0")
            expect(weaponCodeToId("Dch")).toBe("1")
            expect(weaponCodeToId("RADAR")).toBe("2")
        })

        it("should return null for unknown codes", () => {
            expect(weaponCodeToId("unknown")).toBeNull()
            expect(weaponCodeToId("xyz")).toBeNull()
        })

        it("should return null for null/undefined input", () => {
            expect(weaponCodeToId(null)).toBeNull()
            expect(weaponCodeToId(undefined)).toBeNull()
        })
    })

    describe("countWeaponsByType", () => {
        it("should count weapons by type", () => {
            const weapons = [
                { type: "wmn", startX: 0, startY: 0 },
                { type: "wmn", startX: 1, startY: 1 },
                { type: "dch", startX: 2, startY: 2 },
            ]

            const counts = countWeaponsByType(weapons)

            expect(counts).toEqual({ "0": 2, "1": 1 })
        })

        it("should return empty object for empty array", () => {
            expect(countWeaponsByType([])).toEqual({})
        })

        it("should return empty object for null/undefined", () => {
            expect(countWeaponsByType(null)).toEqual({})
            expect(countWeaponsByType(undefined)).toEqual({})
        })

        it("should skip unknown weapon types", () => {
            const weapons = [
                { type: "wmn" },
                { type: "unknown" },
                { type: "anr" },
            ]

            const counts = countWeaponsByType(weapons)

            expect(counts).toEqual({ "0": 1, "2": 1 })
        })
    })

    describe("validateWeaponPlacement", () => {
        it("should return valid when inventory has enough weapons", async () => {
            dbGetUserWeaponInventory.mockResolvedValue({ "0": 5, "1": 2 })

            const weapons = [
                { type: "wmn" },
                { type: "wmn" },
                { type: "dch" },
            ]
            const ctx = { reqId: "test" }

            const result = await validateWeaponPlacement(weapons, 1, ctx)

            expect(result.valid).toBe(true)
            expect(result.counts).toEqual({ "0": 2, "1": 1 })
        })

        it("should return invalid when inventory insufficient", async () => {
            dbGetUserWeaponInventory.mockResolvedValue({ "0": 1, "1": 0 })

            const weapons = [
                { type: "wmn" },
                { type: "wmn" },
                { type: "dch" },
            ]
            const ctx = { reqId: "test" }

            const result = await validateWeaponPlacement(weapons, 1, ctx)

            expect(result.valid).toBe(false)
            expect(result.error).toContain("Insufficient mine")
        })

        it("should return valid for empty weapons array", async () => {
            dbGetUserWeaponInventory.mockResolvedValue({})

            const ctx = { reqId: "test" }

            const result = await validateWeaponPlacement([], 1, ctx)

            expect(result.valid).toBe(true)
            expect(result.counts).toEqual({})
        })

        it("should handle weapons not in inventory", async () => {
            dbGetUserWeaponInventory.mockResolvedValue({})

            const weapons = [{ type: "wmn" }]
            const ctx = { reqId: "test" }

            const result = await validateWeaponPlacement(weapons, 1, ctx)

            expect(result.valid).toBe(false)
            expect(result.error).toContain("Insufficient mine: need 1, have 0")
        })
    })

    describe("trackWeaponPlacement", () => {
        it("should track weapons successfully", async () => {
            dbSetTrackedWeapons.mockResolvedValue(true)

            const ctx = { reqId: "test" }
            const result = await trackWeaponPlacement(
                1000n,
                0,
                { "0": 2, "1": 1 },
                ctx
            )

            expect(result).toBe(true)
            expect(dbSetTrackedWeapons).toHaveBeenCalledWith(
                1000n,
                0,
                { "0": 2, "1": 1 }
            )
        })

        it("should return false on failure", async () => {
            dbSetTrackedWeapons.mockResolvedValue(false)

            const ctx = { reqId: "test" }
            const result = await trackWeaponPlacement(1000n, 0, {}, ctx)

            expect(result).toBe(false)
        })
    })

    describe("trackRadarUsage", () => {
        it("should track radar usage", async () => {
            dbIncrementWeaponUsage.mockResolvedValue(true)

            const ctx = { reqId: "test" }
            const result = await trackRadarUsage(1000n, 0, ctx)

            expect(result).toBe(true)
            expect(dbIncrementWeaponUsage).toHaveBeenCalledWith(
                1000n,
                0,
                "radar"
            )
        })

        it("should return false on failure", async () => {
            dbIncrementWeaponUsage.mockResolvedValue(false)

            const ctx = { reqId: "test" }
            const result = await trackRadarUsage(1000n, 0, ctx)

            expect(result).toBe(false)
        })
    })

    describe("trackShuffleUsage", () => {
        it("should track shuffle usage", async () => {
            dbIncrementWeaponUsage.mockResolvedValue(true)

            const ctx = { reqId: "test" }
            const result = await trackShuffleUsage(1000n, 1, ctx)

            expect(result).toBe(true)
            expect(dbIncrementWeaponUsage).toHaveBeenCalledWith(
                1000n,
                1,
                "shuffle"
            )
        })

        it("should return false on failure", async () => {
            dbIncrementWeaponUsage.mockResolvedValue(false)

            const ctx = { reqId: "test" }
            const result = await trackShuffleUsage(1000n, 0, ctx)

            expect(result).toBe(false)
        })
    })

    describe("consumeLoserWeapons", () => {
        const mockConn = { execute: jest.fn() }

        it("should consume loser weapons", async () => {
            dbGetSessionUserId.mockResolvedValue(10)
            dbGetTrackedWeapons.mockResolvedValue({ "0": 2, "1": 1 })
            dbConsumeWeapons.mockResolvedValue(true)

            const ctx = { reqId: "test" }
            const result = await consumeLoserWeapons(1000n, 0, mockConn, ctx)

            expect(result).toBe(true)
            expect(dbGetSessionUserId).toHaveBeenCalledWith(1000n, 0)
            expect(dbGetTrackedWeapons).toHaveBeenCalledWith(1000n, 0)
            expect(dbConsumeWeapons).toHaveBeenCalledWith(
                10,
                { "0": 2, "1": 1 },
                mockConn
            )
        })

        it("should return true if no user ID found", async () => {
            dbGetSessionUserId.mockResolvedValue(null)

            const ctx = { reqId: "test" }
            const result = await consumeLoserWeapons(1000n, 0, mockConn, ctx)

            expect(result).toBe(true)
            expect(dbConsumeWeapons).not.toHaveBeenCalled()
        })

        it("should return true if no tracked weapons", async () => {
            dbGetSessionUserId.mockResolvedValue(10)
            dbGetTrackedWeapons.mockResolvedValue(null)

            const ctx = { reqId: "test" }
            const result = await consumeLoserWeapons(1000n, 0, mockConn, ctx)

            expect(result).toBe(true)
            expect(dbConsumeWeapons).not.toHaveBeenCalled()
        })

        it("should return true if tracked weapons is empty", async () => {
            dbGetSessionUserId.mockResolvedValue(10)
            dbGetTrackedWeapons.mockResolvedValue({})

            const ctx = { reqId: "test" }
            const result = await consumeLoserWeapons(1000n, 0, mockConn, ctx)

            expect(result).toBe(true)
            expect(dbConsumeWeapons).not.toHaveBeenCalled()
        })

        it("should return false if consumption fails", async () => {
            dbGetSessionUserId.mockResolvedValue(10)
            dbGetTrackedWeapons.mockResolvedValue({ "0": 1 })
            dbConsumeWeapons.mockResolvedValue(false)

            const ctx = { reqId: "test" }
            const result = await consumeLoserWeapons(1000n, 0, mockConn, ctx)

            expect(result).toBe(false)
        })
    })
})
