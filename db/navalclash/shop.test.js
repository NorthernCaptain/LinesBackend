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
    dbOrderExists,
    dbRecordPurchase,
    dbAddCoins,
    dbGetCoins,
    dbGetInventory,
} = require("./shop")

describe("db/navalclash/shop", () => {
    beforeEach(() => {
        mockExecute.mockReset()
    })

    describe("dbOrderExists", () => {
        it("should return true when order exists", async () => {
            mockExecute.mockResolvedValue([[{ id: 1 }]])

            const result = await dbOrderExists("order-123")

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                "SELECT id FROM purchases WHERE order_id = ?",
                ["order-123"]
            )
        })

        it("should return false when order does not exist", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbOrderExists("new-order")

            expect(result).toBe(false)
        })

        it("should return true on error (safe default)", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbOrderExists("test")

            expect(result).toBe(true)
        })
    })

    describe("dbRecordPurchase", () => {
        it("should record purchase and return insertId", async () => {
            mockExecute.mockResolvedValue([{ insertId: 55 }])

            const result = await dbRecordPurchase({
                userId: 1,
                deviceId: 10,
                sku: "coins_100",
                orderId: "order-456",
                token: "purchase-token",
                coinsAdded: 100,
            })

            expect(result).toBe(55)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO purchases"),
                [1, 10, "coins_100", "order-456", "purchase-token", 100]
            )
        })

        it("should handle null deviceId and token", async () => {
            mockExecute.mockResolvedValue([{ insertId: 1 }])

            await dbRecordPurchase({
                userId: 1,
                deviceId: null,
                sku: "coins_50",
                orderId: "order-789",
                token: null,
                coinsAdded: 50,
            })

            expect(mockExecute).toHaveBeenCalledWith(expect.any(String), [
                1,
                null,
                "coins_50",
                "order-789",
                null,
                50,
            ])
        })

        it("should return null on error", async () => {
            mockExecute.mockRejectedValue(new Error("Duplicate order"))

            const result = await dbRecordPurchase({
                userId: 1,
                deviceId: null,
                sku: "test",
                orderId: "dup",
                token: null,
                coinsAdded: 0,
            })

            expect(result).toBeNull()
        })
    })

    describe("dbAddCoins", () => {
        it("should add coins to user balance", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbAddCoins(1, 100)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                "UPDATE users SET coins = coins + ? WHERE id = ?",
                [100, 1]
            )
        })

        it("should return false on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbAddCoins(1, 50)

            expect(result).toBe(false)
        })
    })

    describe("dbGetCoins", () => {
        it("should return coin balance", async () => {
            mockExecute.mockResolvedValue([[{ coins: 500 }]])

            const result = await dbGetCoins(1)

            expect(result).toBe(500)
            expect(mockExecute).toHaveBeenCalledWith(
                "SELECT coins FROM users WHERE id = ?",
                [1]
            )
        })

        it("should return 0 when user not found", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbGetCoins(999)

            expect(result).toBe(0)
        })

        it("should return 0 on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbGetCoins(1)

            expect(result).toBe(0)
        })
    })

    describe("dbGetInventory", () => {
        it("should return inventory items", async () => {
            const mockItems = [
                {
                    item_type: "weapon",
                    item_id: "radar",
                    quantity: 3,
                    times_used: 1,
                },
                {
                    item_type: "skin",
                    item_id: "camo",
                    quantity: 1,
                    times_used: 0,
                },
            ]
            mockExecute.mockResolvedValue([mockItems])

            const result = await dbGetInventory(1)

            expect(result).toEqual(mockItems)
        })

        it("should return empty array when no inventory", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbGetInventory(1)

            expect(result).toEqual([])
        })

        it("should return empty array on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbGetInventory(1)

            expect(result).toEqual([])
        })
    })
})
