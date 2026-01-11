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

const { dbGetTopScores, dbSubmitScore } = require("./leaderboard")

describe("db/navalclash/leaderboard", () => {
    beforeEach(() => {
        mockExecute.mockReset()
    })

    describe("dbGetTopScores", () => {
        it("should return top scores", async () => {
            const mockScores = [
                { id: 1, score: 1000, user_id: 1, name: "Player1" },
                { id: 2, score: 800, user_id: 2, name: "Player2" },
            ]
            mockExecute.mockResolvedValue([mockScores])

            const result = await dbGetTopScores(1, 3, 10)

            expect(result).toEqual(mockScores)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("ORDER BY ts.score DESC"),
                [1, 3, 10]
            )
        })

        it("should return empty array when no scores", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbGetTopScores(1, 1, 10)

            expect(result).toEqual([])
        })

        it("should return empty array on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbGetTopScores(1, 1, 10)

            expect(result).toEqual([])
        })
    })

    describe("dbSubmitScore", () => {
        it("should submit score and return insertId", async () => {
            mockExecute.mockResolvedValue([{ insertId: 123 }])

            const result = await dbSubmitScore({
                userId: 1,
                opponentId: 2,
                score: 500,
                timeMs: 60000,
                gameType: 3,
                gameVariant: 1,
                userRank: 5,
                opponentRank: 8,
            })

            expect(result).toBe(123)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO topscores"),
                [1, 2, 500, 60000, 3, 1, 5, 8]
            )
        })

        it("should return null on error", async () => {
            mockExecute.mockRejectedValue(new Error("FK violation"))

            const result = await dbSubmitScore({
                userId: 999,
                opponentId: 999,
                score: 100,
                timeMs: 1000,
                gameType: 1,
                gameVariant: 1,
                userRank: 1,
                opponentRank: 1,
            })

            expect(result).toBeNull()
        })
    })
})
