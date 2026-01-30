/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockExecute = jest.fn()
const mockQuery = jest.fn()

jest.mock("./pool", () => ({
    pool: {
        execute: mockExecute,
        query: mockQuery,
    },
}))

const {
    dbGetTopScores,
    dbGetTopScoresByType,
    dbScoreExists,
    dbSubmitScore,
    dbGetUserBestScore,
    dbGetUserLeaderboardRank,
    dbGetTopStars,
    TOPSCORE_THRESHOLD,
    MIN_GAME_TIME_MS,
} = require("./leaderboard")

describe("db/navalclash/leaderboard", () => {
    beforeEach(() => {
        mockExecute.mockReset()
        mockQuery.mockReset()
    })

    describe("dbGetTopScores", () => {
        it("should return top scores from both Android and Human categories", async () => {
            const androidScores = [
                { id: 1, score: 5000, user_id: 1, name: "Player1", game_type: 1, created_at: new Date() },
            ]
            const humanScores = [
                { id: 2, score: 4500, user_id: 2, name: "Player2", game_type: 3, created_at: new Date() },
            ]
            mockQuery
                .mockResolvedValueOnce([androidScores]) // Android query
                .mockResolvedValueOnce([humanScores]) // Human query

            const result = await dbGetTopScores(1, 50)

            // Should combine and sort by score DESC
            expect(result).toHaveLength(2)
            expect(result[0].score).toBe(5000)
            expect(result[1].score).toBe(4500)
            expect(mockQuery).toHaveBeenCalledTimes(2)
        })

        it("should return empty array when no scores", async () => {
            mockQuery
                .mockResolvedValueOnce([[]]) // Android query
                .mockResolvedValueOnce([[]]) // Human query

            const result = await dbGetTopScores(1, 50)

            expect(result).toEqual([])
        })

        it("should return empty array on error", async () => {
            mockQuery.mockRejectedValue(new Error("DB error"))

            const result = await dbGetTopScores(1, 50)

            expect(result).toEqual([])
        })
    })

    describe("dbGetTopScoresByType", () => {
        it("should return top scores filtered by game type", async () => {
            const mockScores = [
                { id: 1, score: 5000, user_id: 1, game_type: 3 },
            ]
            mockQuery.mockResolvedValue([mockScores])

            const result = await dbGetTopScoresByType(1, 3, 10)

            expect(result).toEqual(mockScores)
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("game_type = ?"),
                [1, 3, 1, 3, 10]
            )
        })
    })

    describe("dbScoreExists", () => {
        it("should return true if score exists", async () => {
            mockExecute.mockResolvedValue([[{ id: 1 }]])

            const result = await dbScoreExists(1, 5000, 5)

            expect(result).toBe(true)
        })

        it("should return false if score does not exist", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbScoreExists(1, 5000, 5)

            expect(result).toBe(false)
        })

        it("should return true on error (safe default)", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbScoreExists(1, 5000, 5)

            expect(result).toBe(true)
        })
    })

    describe("dbSubmitScore", () => {
        it("should reject scores below threshold", async () => {
            const result = await dbSubmitScore({
                userId: 1,
                opponentId: 2,
                score: 2000, // Below 3000 threshold
                timeMs: 60000,
                gameType: 3,
                gameVariant: 1,
                userRank: 5,
                opponentRank: 8,
            })

            expect(result.success).toBe(false)
            expect(result.reason).toContain("below threshold")
            expect(mockExecute).not.toHaveBeenCalledWith(
                expect.stringContaining("INSERT"),
                expect.anything()
            )
        })

        it("should reject scores with insufficient game time", async () => {
            const result = await dbSubmitScore({
                userId: 1,
                opponentId: 2,
                score: 5000,
                timeMs: 20000, // Below 30000ms minimum
                gameType: 3,
                gameVariant: 1,
                userRank: 5,
                opponentRank: 8,
            })

            expect(result.success).toBe(false)
            expect(result.reason).toContain("below minimum")
        })

        it("should reject duplicate scores", async () => {
            // Mock dbScoreExists to return true (duplicate)
            mockExecute.mockResolvedValueOnce([[{ id: 123 }]])

            const result = await dbSubmitScore({
                userId: 1,
                opponentId: 2,
                score: 5000,
                timeMs: 60000,
                gameType: 3,
                gameVariant: 1,
                userRank: 5,
                opponentRank: 8,
            })

            expect(result.success).toBe(false)
            expect(result.reason).toBe("Duplicate score")
        })

        it("should submit valid score and return scoreId", async () => {
            // Mock dbScoreExists (no duplicate)
            mockExecute.mockResolvedValueOnce([[]])
            // Mock INSERT
            mockExecute.mockResolvedValueOnce([{ insertId: 456 }])

            const result = await dbSubmitScore({
                userId: 1,
                opponentId: 2,
                score: 5000,
                timeMs: 60000,
                gameType: 3,
                gameVariant: 1,
                userRank: 5,
                opponentRank: 8,
            })

            expect(result.success).toBe(true)
            expect(result.scoreId).toBe(456)
        })

        it("should return failure on database error", async () => {
            // Mock dbScoreExists (no duplicate)
            mockExecute.mockResolvedValueOnce([[]])
            // Mock INSERT failure
            mockExecute.mockRejectedValueOnce(new Error("FK violation"))

            const result = await dbSubmitScore({
                userId: 1,
                opponentId: 2,
                score: 5000,
                timeMs: 60000,
                gameType: 3,
                gameVariant: 1,
                userRank: 5,
                opponentRank: 8,
            })

            expect(result.success).toBe(false)
            expect(result.reason).toContain("FK violation")
        })
    })

    describe("dbGetUserBestScore", () => {
        it("should return user's best score", async () => {
            mockExecute.mockResolvedValue([[{ best_score: 7500 }]])

            const result = await dbGetUserBestScore(1, 1)

            expect(result).toBe(7500)
        })

        it("should return 0 if no scores", async () => {
            mockExecute.mockResolvedValue([[{ best_score: null }]])

            const result = await dbGetUserBestScore(1, 1)

            expect(result).toBe(0)
        })

        it("should return 0 on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbGetUserBestScore(1, 1)

            expect(result).toBe(0)
        })
    })

    describe("dbGetUserLeaderboardRank", () => {
        it("should return user's rank on leaderboard", async () => {
            // Mock dbGetUserBestScore
            mockExecute.mockResolvedValueOnce([[{ best_score: 5000 }]])
            // Mock count query
            mockExecute.mockResolvedValueOnce([[{ rank: 4 }]])

            const result = await dbGetUserLeaderboardRank(1, 1)

            expect(result).toBe(5) // 4 users above + 1
        })

        it("should return null if user has no scores", async () => {
            mockExecute.mockResolvedValueOnce([[{ best_score: null }]])

            const result = await dbGetUserLeaderboardRank(1, 1)

            expect(result).toBeNull()
        })
    })

    describe("dbGetTopStars", () => {
        it("should return top players by stars", async () => {
            const mockUsers = [
                { id: 1, name: "StarPlayer1", stars: 5000, rank: 8 },
                { id: 2, name: "StarPlayer2", stars: 3000, rank: 6 },
            ]
            mockQuery.mockResolvedValue([mockUsers])

            const result = await dbGetTopStars(1, 50)

            expect(result).toEqual(mockUsers)
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("ORDER BY stars DESC"),
                [1, 50]
            )
        })

        it("should return empty array when no users", async () => {
            mockQuery.mockResolvedValue([[]])

            const result = await dbGetTopStars(1, 50)

            expect(result).toEqual([])
        })

        it("should return empty array on error", async () => {
            mockQuery.mockRejectedValue(new Error("DB error"))

            const result = await dbGetTopStars(1, 50)

            expect(result).toEqual([])
        })
    })

    describe("constants", () => {
        it("should export TOPSCORE_THRESHOLD as 3000", () => {
            expect(TOPSCORE_THRESHOLD).toBe(3000)
        })

        it("should export MIN_GAME_TIME_MS as 30000", () => {
            expect(MIN_GAME_TIME_MS).toBe(30000)
        })
    })
})
