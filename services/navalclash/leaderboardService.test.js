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
    getTopScores,
    submitScore,
    serializeScore,
} = require("./leaderboardService")

describe("services/navalclash/leaderboardService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe("serializeScore", () => {
        it("should serialize score data correctly", () => {
            const row = {
                user_id: 123,
                name: "Player1",
                face: 5,
                uuid: "test-uuid",
                score: 1500,
                time_spent_ms: 60000,
                created_at: new Date("2026-01-01"),
            }

            const result = serializeScore(row, 1)

            expect(result).toEqual({
                pos: 1,
                id: 123,
                n: "Player1",
                f: 5,
                uuid: "test-uuid",
                sc: 1500,
                tm: 60000,
                d: row.created_at,
            })
        })

        it("should use correct position", () => {
            const row = { user_id: 1, name: "Test" }
            const result = serializeScore(row, 5)
            expect(result.pos).toBe(5)
        })
    })

    describe("getTopScores", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return top scores with default parameters", async () => {
            mockExecute.mockResolvedValueOnce([
                [
                    { user_id: 1, name: "Player1", face: 1, uuid: "u1", score: 1500, time_spent_ms: 60000 },
                    { user_id: 2, name: "Player2", face: 2, uuid: "u2", score: 1200, time_spent_ms: 70000 },
                ],
            ])

            const req = { requestId: "test", body: {} }

            await getTopScores(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("FROM topscores"),
                [1, 3, 10] // default gameVariant=1, gameType=3, limit=10
            )
            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("top")
            expect(response.list).toHaveLength(2)
            expect(response.list[0].pos).toBe(1)
            expect(response.list[1].pos).toBe(2)
        })

        it("should use custom game variant and type", async () => {
            mockExecute.mockResolvedValueOnce([[]])

            const req = {
                requestId: "test",
                body: { var: 2, tp: 1, limit: 20 },
            }

            await getTopScores(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.anything(),
                [2, 1, 20]
            )
        })

        it("should cap limit at 50", async () => {
            mockExecute.mockResolvedValueOnce([[]])

            const req = {
                requestId: "test",
                body: { limit: 100 },
            }

            await getTopScores(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.anything(),
                [1, 3, 50]
            )
        })

        it("should handle database error", async () => {
            mockExecute.mockRejectedValueOnce(new Error("DB error"))

            const req = { requestId: "test", body: {} }

            await getTopScores(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Database error",
            })
        })
    })

    describe("submitScore", () => {
        it("should submit score and return insertId", async () => {
            mockExecute.mockResolvedValueOnce([{ insertId: 42 }])

            const ctx = { reqId: "test" }
            const result = await submitScore(1, 2, 1500, 60000, 3, 1, 10, 8, ctx)

            expect(result).toBe(42)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO topscores"),
                [1, 2, 1500, 60000, 3, 1, 10, 8]
            )
        })

        it("should return null on error", async () => {
            mockExecute.mockRejectedValueOnce(new Error("DB error"))

            const ctx = { reqId: "test" }
            const result = await submitScore(1, 2, 1500, 60000, 3, 1, 10, 8, ctx)

            expect(result).toBeNull()
        })
    })
})
