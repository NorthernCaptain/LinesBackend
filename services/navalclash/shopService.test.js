/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockExecute = jest.fn()
const mockConnection = {
    execute: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
}

jest.mock("../../db/navalclash", () => ({
    pool: {
        execute: mockExecute,
        getConnection: jest.fn(),
    },
}))

// Mock gameService for val2mess
jest.mock("./gameService", () => ({
    val2mess: jest.fn((v) => v * 1000 + 999), // Simple mock encoding
}))

const { pool } = require("../../db/navalclash")
const { val2mess } = require("./gameService")

const {
    getItemsList,
    getInventory,
    addCoins,
    getCoins,
    internalBuy,
    serializeInventoryItem,
    buildUserResponse,
    BUY_ERROR,
} = require("./shopService")

describe("services/navalclash/shopService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
        pool.getConnection.mockResolvedValue(mockConnection)
        mockConnection.execute.mockReset()
        mockConnection.beginTransaction.mockReset()
        mockConnection.commit.mockReset()
        mockConnection.rollback.mockReset()
        mockConnection.release.mockReset()
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

    describe("getItemsList", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return armory weapons", async () => {
            mockExecute.mockResolvedValueOnce([
                [
                    {
                        weapon_index: 0,
                        price: 50,
                        min_qty: 1,
                        max_qty: 99,
                        unlock_price: 0,
                        purchase_type: "I",
                    },
                    {
                        weapon_index: 1,
                        price: 75,
                        min_qty: 1,
                        max_qty: 99,
                        unlock_price: 0,
                        purchase_type: "I",
                    },
                ],
            ])

            const req = {
                requestId: "test",
                body: { u: { name: "Player", uuid: "abc123" }, lg: "en" },
            }

            await getItemsList(req, mockRes)

            expect(mockExecute).toHaveBeenCalledTimes(1)
            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("ilsa")
            expect(response.its).toHaveLength(2)
            expect(response.its[0]).toEqual({
                type: "sku",
                nm: "0",
                pr: 50,
                mi: 1,
                ma: 99,
                up: 0,
                im: "I",
            })
            expect(response.its[1]).toEqual({
                type: "sku",
                nm: "1",
                pr: 75,
                mi: 1,
                ma: 99,
                up: 0,
                im: "I",
            })
        })

        it("should return empty list if no items", async () => {
            mockExecute.mockResolvedValueOnce([[]])

            const req = { requestId: "test", body: {} }

            await getItemsList(req, mockRes)

            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("ilsa")
            expect(response.its).toEqual([])
        })

        it("should return empty list on database error", async () => {
            mockExecute.mockRejectedValueOnce(new Error("DB error"))

            const req = { requestId: "test", body: {} }

            await getItemsList(req, mockRes)

            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("ilsa")
            expect(response.its).toEqual([])
        })

        it("should handle missing optional fields with defaults", async () => {
            mockExecute.mockResolvedValueOnce([
                [
                    {
                        weapon_index: 2,
                        price: 40,
                        min_qty: 1,
                        max_qty: 99,
                        unlock_price: null,
                        purchase_type: null,
                    },
                ],
            ])

            const req = { requestId: "test", body: {} }

            await getItemsList(req, mockRes)

            const response = mockRes.json.mock.calls[0][0]
            expect(response.its[0]).toEqual({
                type: "sku",
                nm: "2",
                pr: 40,
                mi: 1,
                ma: 99,
                up: 0,
                im: "I",
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

    describe("buildUserResponse", () => {
        it("should build user response with encoded coins", () => {
            const user = {
                name: "TestPlayer",
                uuid: "test-uuid",
                rank: 3,
                stars: 100,
                games: 50,
                gameswon: 25,
                coins: 500,
            }
            const weapons = [5, 3, 2, 0, 1, 0]

            const result = buildUserResponse(user, weapons)

            expect(result.nam).toBe("TestPlayer")
            expect(result.id).toBe("test-uuid")
            expect(result.rk).toBe(3)
            expect(result.st).toBe(100)
            expect(result.pld).toBe(50)
            expect(result.won).toBe(25)
            expect(result.we).toEqual([5, 3, 2, 0, 1, 0])
            // Coins should be encoded via val2mess
            expect(val2mess).toHaveBeenCalledWith(500)
            expect(result.an).toBe(500999) // mock encoding: v * 1000 + 999
        })
    })

    describe("internalBuy", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if missing user", async () => {
            const req = { requestId: "test", body: { its: [{ sku: "0", q: 1, p: 50 }] } }

            await internalBuy(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "ibya",
                rc: BUY_ERROR.DENIED,
                msg: { text: "Missing user" },
            })
        })

        it("should return error if missing items", async () => {
            const req = { requestId: "test", body: { u: { id: "test-uuid" } } }

            await internalBuy(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "ibya",
                rc: BUY_ERROR.DENIED,
                msg: { text: "Missing items" },
            })
        })

        it("should return error if user not found", async () => {
            mockConnection.execute.mockResolvedValueOnce([[]]) // No user found

            const req = {
                requestId: "test",
                body: {
                    u: { id: "unknown-uuid", nam: "Player" },
                    its: [{ sku: "0", q: 1, p: 50 }],
                },
            }

            await internalBuy(req, mockRes)

            expect(mockConnection.rollback).toHaveBeenCalled()
            expect(mockRes.json).toHaveBeenCalledWith({
                type: "ibya",
                rc: BUY_ERROR.DENIED,
                msg: { text: "User not found" },
            })
        })

        it("should return error if price mismatch", async () => {
            const mockUser = { id: 1, name: "Player", uuid: "test-uuid", coins: 500 }

            mockConnection.execute
                .mockResolvedValueOnce([[mockUser]]) // User found
                .mockResolvedValueOnce([[{ weapon_index: 0, price: 50 }]]) // Shop items

            const req = {
                requestId: "test",
                body: {
                    u: { id: "test-uuid", nam: "Player" },
                    its: [{ sku: "0", q: 1, p: 100 }], // Wrong price (100 vs 50)
                },
            }

            await internalBuy(req, mockRes)

            expect(mockConnection.rollback).toHaveBeenCalled()
            expect(mockRes.json).toHaveBeenCalledWith({
                type: "ibya",
                rc: BUY_ERROR.WRONG_PRICE,
                msg: { text: "Price mismatch" },
            })
        })

        it("should return error if insufficient coins", async () => {
            const mockUser = { id: 1, name: "Player", uuid: "test-uuid", coins: 100 }

            mockConnection.execute
                .mockResolvedValueOnce([[mockUser]]) // User found
                .mockResolvedValueOnce([[{ weapon_index: 0, price: 50 }]]) // Shop items

            const req = {
                requestId: "test",
                body: {
                    u: { id: "test-uuid", nam: "Player" },
                    its: [{ sku: "0", q: 5, p: 50 }], // Total cost: 250, user has 100
                },
            }

            await internalBuy(req, mockRes)

            expect(mockConnection.rollback).toHaveBeenCalled()
            expect(mockRes.json).toHaveBeenCalledWith({
                type: "ibya",
                rc: BUY_ERROR.WRONG_PRICE,
                msg: { text: "Insufficient coins" },
            })
        })

        it("should successfully purchase weapons", async () => {
            const mockUser = {
                id: 1,
                name: "Player",
                uuid: "test-uuid",
                rank: 2,
                stars: 50,
                games: 20,
                gameswon: 10,
                coins: 500,
            }

            mockConnection.execute
                .mockResolvedValueOnce([[mockUser]]) // User found
                .mockResolvedValueOnce([[{ weapon_index: 0, price: 50 }, { weapon_index: 1, price: 75 }]]) // Shop items
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // Update coins
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // Insert inventory
                .mockResolvedValueOnce([[{ item_id: "0", quantity: 3 }]]) // Get inventory

            const req = {
                requestId: "test",
                body: {
                    u: { id: "test-uuid", nam: "Player" },
                    its: [{ sku: "0", q: 3, p: 50 }], // Buy 3 mines at 50 = 150
                },
            }

            await internalBuy(req, mockRes)

            expect(mockConnection.commit).toHaveBeenCalled()
            expect(mockConnection.release).toHaveBeenCalled()

            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("ibya")
            expect(response.rc).toBe(BUY_ERROR.SUCCESS)
            expect(response.u).toBeDefined()
            expect(response.u.nam).toBe("Player")
            expect(response.u.we).toEqual([3, 0, 0, 0, 0, 0]) // 3 mines
            // Coins should be encoded: 500 - 150 = 350
            expect(val2mess).toHaveBeenCalledWith(350)
        })

        it("should handle selling weapons (negative quantity)", async () => {
            const mockUser = {
                id: 1,
                name: "Player",
                uuid: "test-uuid",
                rank: 2,
                stars: 50,
                games: 20,
                gameswon: 10,
                coins: 100,
            }

            mockConnection.execute
                .mockResolvedValueOnce([[mockUser]]) // User found
                .mockResolvedValueOnce([[{ weapon_index: 0, price: 50 }]]) // Shop items
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // Update coins (refund)
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // Update inventory (subtract)
                .mockResolvedValueOnce([[{ item_id: "0", quantity: 2 }]]) // Get inventory

            const req = {
                requestId: "test",
                body: {
                    u: { id: "test-uuid", nam: "Player" },
                    its: [{ sku: "0", q: -2, p: 50 }], // Sell 2 mines at 50 = -100 cost (refund)
                },
            }

            await internalBuy(req, mockRes)

            expect(mockConnection.commit).toHaveBeenCalled()

            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("ibya")
            expect(response.rc).toBe(BUY_ERROR.SUCCESS)
            // Coins: 100 - (-100) = 200
            expect(val2mess).toHaveBeenCalledWith(200)
        })

        it("should return error for invalid SKU", async () => {
            const mockUser = { id: 1, name: "Player", uuid: "test-uuid", coins: 500 }

            mockConnection.execute
                .mockResolvedValueOnce([[mockUser]]) // User found
                .mockResolvedValueOnce([[{ weapon_index: 0, price: 50 }]]) // Shop items (only weapon 0)

            const req = {
                requestId: "test",
                body: {
                    u: { id: "test-uuid", nam: "Player" },
                    its: [{ sku: "99", q: 1, p: 50 }], // Invalid SKU
                },
            }

            await internalBuy(req, mockRes)

            expect(mockConnection.rollback).toHaveBeenCalled()
            expect(mockRes.json).toHaveBeenCalledWith({
                type: "ibya",
                rc: BUY_ERROR.WRONG_PRICE,
                msg: { text: "Invalid item" },
            })
        })

        it("should handle database error gracefully", async () => {
            mockConnection.execute.mockRejectedValueOnce(new Error("DB error"))

            const req = {
                requestId: "test",
                body: {
                    u: { id: "test-uuid", nam: "Player" },
                    its: [{ sku: "0", q: 1, p: 50 }],
                },
            }

            await internalBuy(req, mockRes)

            expect(mockConnection.rollback).toHaveBeenCalled()
            expect(mockConnection.release).toHaveBeenCalled()
            expect(mockRes.json).toHaveBeenCalledWith({
                type: "ibya",
                rc: BUY_ERROR.DENIED,
                msg: { text: "Server error" },
            })
        })
    })
})
