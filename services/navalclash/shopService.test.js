/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockExecute = jest.fn()

jest.mock("../../db/navalclash", () => ({
    pool: {
        execute: mockExecute,
    },
}))

const {
    getInventory,
    addCoins,
    getCoins,
    serializeInventoryItem,
} = require("./shopService")

describe("services/navalclash/shopService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe("serializeInventoryItem", () => {
        it("should serialize inventory item correctly", () => {
            const row = {
                item_type: "weapon",
                item_id: "torpedo",
                quantity: 5,
                times_used: 2,
            }

            const result = serializeInventoryItem(row)

            expect(result).toEqual({
                type: "weapon",
                id: "torpedo",
                qty: 5,
                used: 2,
            })
        })
    })

    describe("getInventory", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if missing user ID", async () => {
            await getInventory({ requestId: "test", body: {} }, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Missing user ID",
            })
        })

        it("should return inventory and coins", async () => {
            mockExecute
                .mockResolvedValueOnce([
                    [
                        { item_type: "weapon", item_id: "torpedo", quantity: 3, times_used: 1 },
                        { item_type: "skin", item_id: "camo", quantity: 1, times_used: 0 },
                    ],
                ])
                .mockResolvedValueOnce([[{ coins: 500 }]])

            const req = { requestId: "test", body: { uid: 1 } }

            await getInventory(req, mockRes)

            expect(mockExecute).toHaveBeenCalledTimes(2)
            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("inventory")
            expect(response.coins).toBe(500)
            expect(response.items).toHaveLength(2)
            expect(response.items[0].type).toBe("weapon")
        })

        it("should return 0 coins if user not found", async () => {
            mockExecute
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[]])

            const req = { requestId: "test", body: { uid: 999 } }

            await getInventory(req, mockRes)

            const response = mockRes.json.mock.calls[0][0]
            expect(response.coins).toBe(0)
            expect(response.items).toEqual([])
        })

        it("should handle database error", async () => {
            mockExecute.mockRejectedValueOnce(new Error("DB error"))

            const req = { requestId: "test", body: { uid: 1 } }

            await getInventory(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Database error",
            })
        })
    })

    describe("addCoins", () => {
        it("should add coins and return true", async () => {
            mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }])

            const ctx = { reqId: "test" }
            const result = await addCoins(1, 100, ctx)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                "UPDATE users SET coins = coins + ? WHERE id = ?",
                [100, 1]
            )
        })

        it("should return false on error", async () => {
            mockExecute.mockRejectedValueOnce(new Error("DB error"))

            const ctx = { reqId: "test" }
            const result = await addCoins(1, 100, ctx)

            expect(result).toBe(false)
        })
    })

    describe("getCoins", () => {
        it("should return user's coin balance", async () => {
            mockExecute.mockResolvedValueOnce([[{ coins: 250 }]])

            const result = await getCoins(1)

            expect(result).toBe(250)
        })

        it("should return 0 if user not found", async () => {
            mockExecute.mockResolvedValueOnce([[]])

            const result = await getCoins(999)

            expect(result).toBe(0)
        })

        it("should return 0 on error", async () => {
            mockExecute.mockRejectedValueOnce(new Error("DB error"))

            const result = await getCoins(1)

            expect(result).toBe(0)
        })
    })
})
