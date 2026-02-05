/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

jest.mock("../../db/navalclash", () => ({
    dbGetTopScores: jest.fn(),
    dbGetTopScoresByType: jest.fn(),
    dbSubmitScore: jest.fn(),
    dbGetUserLeaderboardRank: jest.fn(),
    dbGetTopStars: jest.fn(),
    dbFindUserByUuid: jest.fn(),
    dbFindUserByUuidAndName: jest.fn(),
    dbCreateUser: jest.fn(),
    TOPSCORE_THRESHOLD: 3000,
    MIN_GAME_TIME_MS: 30000,
}))

jest.mock("../../utils/logger", () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}))

const {
    dbGetTopScores,
    dbGetTopScoresByType,
    dbSubmitScore,
    dbGetUserLeaderboardRank,
    dbGetTopStars,
    dbFindUserByUuid,
    dbFindUserByUuidAndName,
    dbCreateUser,
} = require("../../db/navalclash")

const {
    getTopScores,
    submitScore,
    getUserLeaderboardRank,
    serializeScore,
    serializeStarEntry,
    TOPSCORE_THRESHOLD,
    MIN_GAME_TIME_MS,
} = require("./leaderboardService")

const { VERSION } = require("./constants")

describe("services/navalclash/leaderboardService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe("serializeScore", () => {
        it("should serialize score with user and opponent info", () => {
            const row = {
                user_id: 123,
                name: "Winner",
                face: 5,
                uuid: "winner-uuid",
                score: 5500,
                time_spent_ms: 60000,
                user_rank: 5,
                game_type: 3,
                created_at: new Date("2026-01-15T10:30:00Z"),
                opponent_id: 456,
                opponent_name: "Loser",
                opponent_face: 3,
                opponent_rank: 4,
            }

            const result = serializeScore(row)

            expect(result).toEqual({
                type: "Score",
                score: 5500,
                time: 60000,
                gtype: 2, // DB game_type 3 (web) -> client gtype 2 (web)
                ct: new Date("2026-01-15T10:30:00Z").getTime(),
                u: {
                    nam: "Winner",
                    i: 123,
                    rk: 5,
                    fc: 5,
                    id: "winner-uuid",
                },
                o: {
                    nam: "Loser",
                    i: 456,
                    rk: 4,
                    fc: 3,
                },
            })
        })

        it("should not include 'o' field when no opponent", () => {
            const row = {
                user_id: 123,
                name: "Winner",
                score: 5500,
                time_spent_ms: 60000,
                game_type: 3,
                opponent_id: null,
            }

            const result = serializeScore(row)

            expect(result.o).toBeUndefined()
            expect("o" in result).toBe(false)
        })

        it("should handle missing optional fields", () => {
            const row = {
                user_id: 123,
                name: "Player",
                score: 5000,
            }

            const result = serializeScore(row)

            expect(result.u.fc).toBe(0)
            expect(result.u.rk).toBe(0)
            expect(result.u.id).toBe("")
        })
    })

    describe("serializeStarEntry", () => {
        it("should serialize star ranking entry with all fields", () => {
            const row = {
                id: 123,
                name: "StarPlayer",
                uuid: "star-uuid",
                rank: 7,
                stars: 5000,
                face: 3,
                games: 200,
                gameswon: 150,
                games_android: 50,
                games_bluetooth: 30,
                games_web: 100,
                games_passplay: 20,
                wins_android: 40,
                wins_bluetooth: 25,
                wins_web: 75,
                wins_passplay: 10,
            }

            const result = serializeStarEntry(row)

            expect(result.type).toBe("Score")
            expect(result.score).toBe(5000)
            expect(result.u.nam).toBe("StarPlayer")
            expect(result.u.i).toBe(123)
            expect(result.u.rk).toBe(7)
            expect(result.u.st).toBe(5000)
            expect(result.u.pld).toBe(200)
            expect(result.u.won).toBe(150)
            expect(result.u.ga).toEqual([50, 30, 100, 20])
            expect(result.u.wa).toEqual([40, 25, 75, 10])
            expect(result.o).toBeUndefined()
            expect("o" in result).toBe(false)
        })

        it("should handle missing optional fields", () => {
            const row = {
                id: 1,
                name: "Player",
            }

            const result = serializeStarEntry(row)

            expect(result.score).toBe(0)
            expect(result.u.st).toBe(0)
            expect(result.u.ga).toEqual([0, 0, 0, 0])
            expect(result.u.wa).toEqual([0, 0, 0, 0])
        })
    })

    describe("getTopScores", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return top scores without game type filter", async () => {
            const mockScores = [
                {
                    user_id: 1,
                    name: "Player1",
                    score: 6000,
                    game_type: 3,
                    time_spent_ms: 60000,
                },
                {
                    user_id: 2,
                    name: "Player2",
                    score: 5500,
                    game_type: 3,
                    time_spent_ms: 70000,
                },
            ]
            dbGetTopScores.mockResolvedValue(mockScores)

            const req = { requestId: "test", body: { var: 1 } }
            await getTopScores(req, mockRes)

            expect(dbGetTopScores).toHaveBeenCalledWith(1, 50)
            expect(dbGetTopScoresByType).not.toHaveBeenCalled()

            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("topTen")
            expect(response.var).toBe(1)
            expect(response.scores).toHaveLength(2)
            expect(response.scores[0].score).toBe(6000)
        })

        it("should filter by game type when provided", async () => {
            dbGetTopScoresByType.mockResolvedValue([])

            const req = { requestId: "test", body: { var: 1, tp: 3 } }
            await getTopScores(req, mockRes)

            expect(dbGetTopScoresByType).toHaveBeenCalledWith(1, 3, 50)
            expect(dbGetTopScores).not.toHaveBeenCalled()
        })

        it("should use default game variant 1", async () => {
            dbGetTopScores.mockResolvedValue([])

            const req = { requestId: "test", body: {} }
            await getTopScores(req, mockRes)

            expect(dbGetTopScores).toHaveBeenCalledWith(1, 50)
        })

        it("should handle database error", async () => {
            dbGetTopScores.mockRejectedValue(new Error("DB error"))

            const req = { requestId: "test", body: {} }
            await getTopScores(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Database error",
            })
        })

        it("should process client scores with existing user", async () => {
            dbGetTopScores.mockResolvedValue([])
            dbFindUserByUuidAndName.mockResolvedValue({ id: 42, name: "TestPlayer", uuid: "test-uuid-12345" })
            dbSubmitScore.mockResolvedValue({ success: true, scoreId: 999 })

            const req = {
                requestId: "test",
                body: {
                    var: 1,
                    scores: [{
                        score: 5000,
                        time: 60000,
                        gtype: 2, // web (client format)
                        u: { id: "test-uuid-12345", nam: "TestPlayer", rk: 5 },
                    }],
                },
            }
            await getTopScores(req, mockRes)

            expect(dbFindUserByUuidAndName).toHaveBeenCalledWith("test-uuid-12345", "TestPlayer")
            expect(dbSubmitScore).toHaveBeenCalledWith(expect.objectContaining({
                userId: 42,
                score: 5000,
                gameType: 3, // web (DB format: client 2 + 1 = 3)
            }))
        })

        it("should create user when not found (like old Java server)", async () => {
            dbGetTopScores.mockResolvedValue([])
            dbFindUserByUuidAndName.mockResolvedValue(null) // Not found by uuid+name
            dbFindUserByUuid.mockResolvedValue(null) // Not found by uuid only
            dbCreateUser.mockResolvedValue(123) // New user created with ID 123
            dbSubmitScore.mockResolvedValue({ success: true, scoreId: 999 })

            const req = {
                requestId: "test",
                body: {
                    var: 1,
                    scores: [{
                        score: 5000,
                        time: 60000,
                        gtype: 0, // android (client format)
                        u: { id: "new-user-uuid-12345", nam: "NewPlayer", rk: 3 },
                    }],
                },
            }
            await getTopScores(req, mockRes)

            expect(dbCreateUser).toHaveBeenCalledWith({
                name: "NewPlayer",
                uuid: "new-user-uuid-12345",
                gameVariant: 1,
            })
            expect(dbSubmitScore).toHaveBeenCalledWith(expect.objectContaining({
                userId: 123,
                score: 5000,
                gameType: 1, // android (DB format: client 0 + 1 = 1)
            }))
        })

        it("should create opponent when not found", async () => {
            dbGetTopScores.mockResolvedValue([])
            // User exists
            dbFindUserByUuidAndName
                .mockResolvedValueOnce({ id: 42, name: "Winner", uuid: "winner-uuid-12345" })
                .mockResolvedValueOnce(null) // Opponent not found by uuid+name
            dbFindUserByUuid.mockResolvedValue(null) // Opponent not found by uuid only
            dbCreateUser.mockResolvedValue(99) // Opponent created with ID 99
            dbSubmitScore.mockResolvedValue({ success: true, scoreId: 999 })

            const req = {
                requestId: "test",
                body: {
                    var: 1,
                    scores: [{
                        score: 5000,
                        time: 60000,
                        gtype: 2,
                        u: { id: "winner-uuid-12345", nam: "Winner", rk: 5 },
                        o: { id: "opponent-uuid-12345", nam: "Opponent", rk: 3 },
                    }],
                },
            }
            await getTopScores(req, mockRes)

            expect(dbCreateUser).toHaveBeenCalledWith({
                name: "Opponent",
                uuid: "opponent-uuid-12345",
                gameVariant: 1,
            })
            expect(dbSubmitScore).toHaveBeenCalledWith(expect.objectContaining({
                userId: 42,
                opponentId: 99,
            }))
        })

        it("should skip scores with invalid UUIDs", async () => {
            dbGetTopScores.mockResolvedValue([])

            const req = {
                requestId: "test",
                body: {
                    var: 1,
                    scores: [
                        { score: 5000, time: 60000, u: { id: "android", nam: "Test" } },
                        { score: 5000, time: 60000, u: { id: "null", nam: "Test" } },
                        { score: 5000, time: 60000, u: { id: "short", nam: "Test" } },
                    ],
                },
            }
            await getTopScores(req, mockRes)

            expect(dbFindUserByUuidAndName).not.toHaveBeenCalled()
            expect(dbSubmitScore).not.toHaveBeenCalled()
        })

        it("should include topstars for clients with version > 30", async () => {
            dbGetTopScores.mockResolvedValue([])
            dbGetTopStars.mockResolvedValue([
                { id: 1, name: "StarPlayer", stars: 5000, rank: 7 },
            ])

            const req = {
                requestId: "test",
                body: { var: 1, v: 31 }, // Version > 30
            }
            await getTopScores(req, mockRes)

            expect(dbGetTopStars).toHaveBeenCalledWith(1, 50)
            const response = mockRes.json.mock.calls[0][0]
            expect(response.topstars).toBeDefined()
            expect(response.topstars.type).toBe("topTen")
            expect(response.topstars.scores).toHaveLength(1)
            expect(response.topstars.scores[0].u.nam).toBe("StarPlayer")
        })

        it("should NOT include topstars for clients with version <= 30", async () => {
            dbGetTopScores.mockResolvedValue([])

            const req = {
                requestId: "test",
                body: { var: 1, v: 30 }, // Version = 30 (not > 30)
            }
            await getTopScores(req, mockRes)

            expect(dbGetTopStars).not.toHaveBeenCalled()
            const response = mockRes.json.mock.calls[0][0]
            expect(response.topstars).toBeUndefined()
        })

        it("should NOT include topstars when version not provided", async () => {
            dbGetTopScores.mockResolvedValue([])

            const req = {
                requestId: "test",
                body: { var: 1 }, // No version
            }
            await getTopScores(req, mockRes)

            expect(dbGetTopStars).not.toHaveBeenCalled()
            const response = mockRes.json.mock.calls[0][0]
            expect(response.topstars).toBeUndefined()
        })
    })

    describe("submitScore", () => {
        it("should submit score and return result", async () => {
            dbSubmitScore.mockResolvedValue({ success: true, scoreId: 42 })

            const ctx = { reqId: "test" }
            const result = await submitScore(
                1,
                2,
                5000,
                60000,
                3,
                1,
                5,
                4,
                ctx
            )

            expect(result).toEqual({ success: true, scoreId: 42 })
            expect(dbSubmitScore).toHaveBeenCalledWith({
                userId: 1,
                opponentId: 2,
                score: 5000,
                timeMs: 60000,
                gameType: 3,
                gameVariant: 1,
                userRank: 5,
                opponentRank: 4,
            })
        })

        it("should return failure result when validation fails", async () => {
            dbSubmitScore.mockResolvedValue({
                success: false,
                reason: "Score below threshold",
            })

            const ctx = { reqId: "test" }
            const result = await submitScore(
                1,
                2,
                2000, // Below threshold
                60000,
                3,
                1,
                5,
                4,
                ctx
            )

            expect(result.success).toBe(false)
            expect(result.reason).toContain("threshold")
        })
    })

    describe("getUserLeaderboardRank", () => {
        it("should return user's leaderboard rank", async () => {
            dbGetUserLeaderboardRank.mockResolvedValue(5)

            const result = await getUserLeaderboardRank(123, 1)

            expect(result).toBe(5)
            expect(dbGetUserLeaderboardRank).toHaveBeenCalledWith(123, 1)
        })

        it("should return null if user not ranked", async () => {
            dbGetUserLeaderboardRank.mockResolvedValue(null)

            const result = await getUserLeaderboardRank(999, 1)

            expect(result).toBeNull()
        })
    })

    describe("constants", () => {
        it("should export TOPSCORE_THRESHOLD", () => {
            expect(TOPSCORE_THRESHOLD).toBe(3000)
        })

        it("should export MIN_GAME_TIME_MS", () => {
            expect(MIN_GAME_TIME_MS).toBe(30000)
        })

        it("VERSION.TOPSTARS_MIN should be 30", () => {
            expect(VERSION.TOPSTARS_MIN).toBe(30)
        })
    })
})
