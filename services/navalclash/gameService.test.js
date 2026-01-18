/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockConnection = {
    execute: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
}

jest.mock("../../db/navalclash", () => ({
    pool: {
        execute: jest.fn(),
        getConnection: jest.fn(),
    },
    SESSION_STATUS: {
        WAITING: 0,
        IN_PROGRESS: 1,
        FINISHED_OK: 10,
        FINISHED_TERMINATED_WAITING: 2,
        FINISHED_SURRENDERED_AUTO: 3,
        FINISHED_SURRENDERED: 4,
        FINISHED_TIMED_OUT_WAITING: 5,
        FINISHED_TIMED_OUT_PLAYING: 6,
        FINISHED_TERMINATED_DUPLICATE: 7,
    },
    dbLogTrainingShot: jest.fn().mockResolvedValue(true),
    dbGetTrainingShotCount: jest.fn().mockResolvedValue(0),
    dbFinalizeTrainingGame: jest.fn().mockResolvedValue(true),
}))

const {
    pool,
    dbLogTrainingShot,
    dbGetTrainingShotCount,
    dbFinalizeTrainingGame,
} = require("../../db/navalclash")

jest.mock("./messageService", () => ({
    sendMessage: jest.fn().mockResolvedValue(1),
}))

const {
    greeting,
    fieldRequest,
    fieldInfo,
    shoot,
    yourTurn,
    info,
    chat,
    finish,
    dutchMove,
    shipMove,
    validateSession,
    determineWinnerLoser,
    BONUS_TYPE,
    calculateWinBonus,
    calculateBonusCoins,
    clamp,
    buildBonusObject,
    PAID_VERSION_MIN,
    RANK_THRESHOLDS,
    RANK_THRESHOLDS_PAID,
    RANK_THRESHOLDS_FREE,
    calculateRank,
    val2mess,
} = require("./gameService")

const { sendMessage } = require("./messageService")

describe("services/navalclash/gameService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
        pool.getConnection.mockResolvedValue(mockConnection)
    })

    describe("clamp", () => {
        it("should return value if within range", () => {
            expect(clamp(5, 0, 10)).toBe(5)
        })

        it("should return min if value below range", () => {
            expect(clamp(-5, 0, 10)).toBe(0)
        })

        it("should return max if value above range", () => {
            expect(clamp(15, 0, 10)).toBe(10)
        })
    })

    describe("val2mess", () => {
        it("should encode 0 correctly", () => {
            // Known value from Java: val2mess(0) should produce a specific encoded value
            const encoded = val2mess(0)
            expect(typeof encoded).toBe("number")
            expect(encoded).toBeGreaterThan(0) // Encoded 0 should not be 0
        })

        it("should encode positive values", () => {
            const encoded = val2mess(100)
            expect(typeof encoded).toBe("number")
            expect(encoded).not.toBe(100) // Should be different from input
        })

        it("should handle negative values", () => {
            const encoded = val2mess(-5)
            expect(typeof encoded).toBe("number")
            // Negative values have LSB set to 1
            expect(encoded & 1).toBe(1)
        })

        it("should encode different values to different results", () => {
            const encoded0 = val2mess(0)
            const encoded1 = val2mess(1)
            const encoded100 = val2mess(100)
            expect(encoded0).not.toBe(encoded1)
            expect(encoded1).not.toBe(encoded100)
        })
    })

    describe("calculateWinBonus", () => {
        it("should return base bonus (9) when ranks are equal", () => {
            expect(calculateWinBonus(5, 5)).toBe(9)
        })

        it("should add rank difference when beating higher ranked opponent", () => {
            // Winner rank 2, opponent rank 6 -> 9 + (6-2) = 13
            expect(calculateWinBonus(2, 6)).toBe(13)
        })

        it("should subtract rank difference when beating lower ranked opponent", () => {
            // Winner rank 6, opponent rank 2 -> 9 + (2-6) = 5
            expect(calculateWinBonus(6, 2)).toBe(5)
        })

        it("should cap positive rank difference at +5", () => {
            // Winner rank 1, opponent rank 10 -> 9 + 5 (capped) = 14
            expect(calculateWinBonus(1, 10)).toBe(14)
        })

        it("should cap negative rank difference at -5", () => {
            // Winner rank 10, opponent rank 1 -> 9 + (-5) (capped) = 4
            expect(calculateWinBonus(10, 1)).toBe(4)
        })
    })

    describe("calculateBonusCoins", () => {
        it("should return correct coins for WIN_BONUS", () => {
            expect(calculateBonusCoins(BONUS_TYPE.WIN_BONUS, 3, 5)).toBe(11) // 9 + 2
        })

        it("should return -1 for LOST_BONUS", () => {
            expect(calculateBonusCoins(BONUS_TYPE.LOST_BONUS)).toBe(-1)
        })

        it("should return half of win bonus for SURRENDER_WIN_BONUS", () => {
            // Win bonus would be 13, half is 6
            expect(calculateBonusCoins(BONUS_TYPE.SURRENDER_WIN_BONUS, 2, 6)).toBe(6)
        })

        it("should return at least 1 for SURRENDER_WIN_BONUS", () => {
            // Win bonus would be 4, half is 2, so return 2
            expect(calculateBonusCoins(BONUS_TYPE.SURRENDER_WIN_BONUS, 10, 1)).toBe(2)
            // Even with very low bonus, minimum is 1
            expect(calculateBonusCoins(BONUS_TYPE.SURRENDER_WIN_BONUS, 5, 5)).toBe(4) // 9/2 = 4
        })

        it("should return -2 for SURRENDER_LOST_BONUS", () => {
            expect(calculateBonusCoins(BONUS_TYPE.SURRENDER_LOST_BONUS)).toBe(-2)
        })

        it("should return 1 for INTERRUPT_WIN_BONUS", () => {
            expect(calculateBonusCoins(BONUS_TYPE.INTERRUPT_WIN_BONUS)).toBe(1)
        })

        it("should return 0 for INTERRUPT_LOST_BONUS", () => {
            expect(calculateBonusCoins(BONUS_TYPE.INTERRUPT_LOST_BONUS)).toBe(0)
        })

        it("should return +2 for LOST_BONUS_WITH_WEAPONS", () => {
            expect(calculateBonusCoins(BONUS_TYPE.LOST_BONUS_WITH_WEAPONS)).toBe(2)
        })

        it("should return 0 for unknown bonus type", () => {
            expect(calculateBonusCoins(99)).toBe(0)
        })
    })

    describe("buildBonusObject", () => {
        it("should return correct structure with type bns", () => {
            const result = buildBonusObject(5, 5)
            expect(result.type).toBe("bns")
            expect(result.gbc).toHaveLength(8)
            expect(result.gbs).toHaveLength(8)
        })

        it("should calculate and encode gbc values for equal ranks", () => {
            const result = buildBonusObject(5, 5)
            // gbc indices: 0=WIN, 1=LOST, 2=SURR_WIN, 3=SURR_LOST, 4=INT_WIN, 5=INT_LOST, 6=unused, 7=LOST_WEAPONS
            // All values are encoded with val2mess()
            expect(result.gbc[0]).toBe(val2mess(9)) // WIN: 9 + 0
            expect(result.gbc[1]).toBe(val2mess(-1)) // LOST: -1
            expect(result.gbc[2]).toBe(val2mess(4)) // SURR_WIN: floor(9/2) = 4
            expect(result.gbc[3]).toBe(val2mess(-2)) // SURR_LOST: -2
            expect(result.gbc[4]).toBe(val2mess(1)) // INT_WIN: 1
            expect(result.gbc[5]).toBe(val2mess(0)) // INT_LOST: 0
            expect(result.gbc[6]).toBe(val2mess(0)) // unused
            expect(result.gbc[7]).toBe(val2mess(2)) // LOST_WEAPONS: +2
        })

        it("should calculate and encode gbc values when beating higher ranked opponent", () => {
            // myRank=2, opponentRank=7 -> delta = +5 (capped)
            const result = buildBonusObject(2, 7)
            expect(result.gbc[0]).toBe(val2mess(14)) // WIN: 9 + 5
            expect(result.gbc[2]).toBe(val2mess(7)) // SURR_WIN: floor(14/2) = 7
        })

        it("should calculate and encode gbc values when beating lower ranked opponent", () => {
            // myRank=8, opponentRank=3 -> delta = -5 (capped)
            const result = buildBonusObject(8, 3)
            expect(result.gbc[0]).toBe(val2mess(4)) // WIN: 9 + (-5)
            expect(result.gbc[2]).toBe(val2mess(2)) // SURR_WIN: floor(4/2) = 2
        })

        it("should encode gbs array with opponent rank + 1 for win", () => {
            const result = buildBonusObject(3, 7)
            // gbs[0] = opponent_rank + 1 (stars for winning), all encoded
            expect(result.gbs[0]).toBe(val2mess(8)) // 7 + 1
            expect(result.gbs[1]).toBe(val2mess(0)) // LOST
            expect(result.gbs[2]).toBe(val2mess(1)) // SURR_WIN
            expect(result.gbs[3]).toBe(val2mess(0)) // SURR_LOST
            expect(result.gbs[4]).toBe(val2mess(1)) // INT_WIN
            expect(result.gbs[5]).toBe(val2mess(0)) // INT_LOST
            expect(result.gbs[6]).toBe(val2mess(0)) // unused
            expect(result.gbs[7]).toBe(val2mess(0)) // LOST_WEAPONS
        })
    })

    describe("calculateRank", () => {
        describe("paid version (v >= 2000)", () => {
            it("should return rank 0 (Ensign) for 0 stars", () => {
                expect(calculateRank(0, 2000)).toBe(0)
            })

            it("should return rank 0 (Ensign) for 9 stars", () => {
                expect(calculateRank(9, 2000)).toBe(0)
            })

            it("should return rank 1 (Lieutenant) for 10 stars", () => {
                expect(calculateRank(10, 2000)).toBe(1)
            })

            it("should return rank 2 (Lieutenant Commander) for 50 stars", () => {
                expect(calculateRank(50, 2000)).toBe(2)
            })

            it("should return rank 3 (Commander) for 100 stars", () => {
                expect(calculateRank(100, 2000)).toBe(3)
            })

            it("should return rank 4 (Captain) for 200 stars", () => {
                expect(calculateRank(200, 2000)).toBe(4)
            })

            it("should return rank 5 (Rear Admiral) for 500 stars", () => {
                expect(calculateRank(500, 2000)).toBe(5)
            })

            it("should return rank 6 (Admiral) for 1000 stars", () => {
                expect(calculateRank(1000, 2000)).toBe(6)
            })

            it("should return rank 7 (Fleet Admiral) for 3000 stars", () => {
                expect(calculateRank(3000, 2000)).toBe(7)
            })

            it("should return rank 8 (Honored Fleet Admiral) for 50000 stars", () => {
                expect(calculateRank(50000, 2000)).toBe(8)
            })

            it("should handle boundary values correctly", () => {
                expect(calculateRank(49, 2000)).toBe(1) // just below Lieutenant Commander
                expect(calculateRank(51, 2000)).toBe(2) // just above Lieutenant Commander
                expect(calculateRank(999, 2000)).toBe(5) // just below Admiral
                expect(calculateRank(1001, 2000)).toBe(6) // just above Admiral
            })

            it("should return highest rank for very high stars", () => {
                expect(calculateRank(100000, 2000)).toBe(8)
                expect(calculateRank(1000000, 2000)).toBe(8)
            })

            it("should default to paid version when no version specified", () => {
                expect(calculateRank(1000)).toBe(6) // Admiral in paid version
            })
        })

        describe("free version (v < 2000)", () => {
            it("should return rank 0 (Seaman) for 0 stars", () => {
                expect(calculateRank(0, 1999)).toBe(0)
            })

            it("should return rank 0 (Seaman) for 9 stars", () => {
                expect(calculateRank(9, 1999)).toBe(0)
            })

            it("should return rank 1 (Petty Officer) for 10 stars", () => {
                expect(calculateRank(10, 1999)).toBe(1)
            })

            it("should return rank 1 (Petty Officer) for 69 stars", () => {
                expect(calculateRank(69, 1999)).toBe(1)
            })

            it("should return rank 2 (Master Chief) for 70 stars", () => {
                expect(calculateRank(70, 1999)).toBe(2)
            })

            it("should return rank 2 (Master Chief) for 249 stars", () => {
                expect(calculateRank(249, 1999)).toBe(2)
            })

            it("should return rank 3 (Warrant) for 250 stars", () => {
                expect(calculateRank(250, 1999)).toBe(3)
            })

            it("should return rank 3 (Warrant) for very high stars", () => {
                expect(calculateRank(50000, 1999)).toBe(3) // max rank is 3 in free version
            })

            it("should use free thresholds for any version < 2000", () => {
                expect(calculateRank(1000, 100)).toBe(3)
                expect(calculateRank(1000, 1000)).toBe(3)
                expect(calculateRank(1000, 1500)).toBe(3)
            })
        })

        describe("version boundary", () => {
            it("should use free thresholds for version 1999", () => {
                expect(calculateRank(1000, 1999)).toBe(3) // Warrant (max in free)
            })

            it("should use paid thresholds for version 2000", () => {
                expect(calculateRank(1000, 2000)).toBe(6) // Admiral in paid
            })

            it("should use paid thresholds for version > 2000", () => {
                expect(calculateRank(1000, 2500)).toBe(6) // Admiral in paid
            })
        })
    })

    describe("RANK_THRESHOLDS", () => {
        it("should have 9 rank thresholds (paid)", () => {
            expect(RANK_THRESHOLDS).toHaveLength(9)
            expect(RANK_THRESHOLDS_PAID).toHaveLength(9)
        })

        it("should have 4 rank thresholds (free)", () => {
            expect(RANK_THRESHOLDS_FREE).toHaveLength(4)
        })

        it("should be sorted by stars descending (paid)", () => {
            for (let i = 1; i < RANK_THRESHOLDS_PAID.length; i++) {
                expect(RANK_THRESHOLDS_PAID[i - 1].stars).toBeGreaterThan(
                    RANK_THRESHOLDS_PAID[i].stars
                )
            }
        })

        it("should be sorted by stars descending (free)", () => {
            for (let i = 1; i < RANK_THRESHOLDS_FREE.length; i++) {
                expect(RANK_THRESHOLDS_FREE[i - 1].stars).toBeGreaterThan(
                    RANK_THRESHOLDS_FREE[i].stars
                )
            }
        })

        it("PAID_VERSION_MIN should be 2000", () => {
            expect(PAID_VERSION_MIN).toBe(2000)
        })
    })

    describe("validateSession", () => {
        it("should return null and respond with error if no sid", () => {
            const res = { json: jest.fn() }
            const ctx = { reqId: "test" }

            const result = validateSession(null, res, ctx)

            expect(result).toBeNull()
            expect(res.json).toHaveBeenCalledWith({
                type: "error",
                reason: "No session",
            })
        })

        it("should return session info for valid sid", () => {
            const res = { json: jest.fn() }
            const ctx = { reqId: "test" }

            const result = validateSession("1000", res, ctx)

            expect(result).toEqual({
                sessionId: 1000n,
                player: 0,
                baseSessionId: 1000n,
            })
        })

        it("should correctly identify player 1 from odd session ID", () => {
            const res = { json: jest.fn() }
            const ctx = { reqId: "test" }

            const result = validateSession("1001", res, ctx)

            expect(result).toEqual({
                sessionId: 1001n,
                player: 1,
                baseSessionId: 1000n,
            })
        })
    })

    describe("determineWinnerLoser", () => {
        const gameSession = {
            user_one_id: 100,
            user_two_id: 200,
        }

        it("should return player 0 as winner when player 0 won", () => {
            const result = determineWinnerLoser(gameSession, 0, true)
            expect(result).toEqual({ winnerId: 100, loserId: 200 })
        })

        it("should return player 1 as winner when player 1 won", () => {
            const result = determineWinnerLoser(gameSession, 1, true)
            expect(result).toEqual({ winnerId: 200, loserId: 100 })
        })

        it("should return player 1 as winner when player 0 lost", () => {
            const result = determineWinnerLoser(gameSession, 0, false)
            expect(result).toEqual({ winnerId: 200, loserId: 100 })
        })

        it("should return player 0 as winner when player 1 lost", () => {
            const result = determineWinnerLoser(gameSession, 1, false)
            expect(result).toEqual({ winnerId: 100, loserId: 200 })
        })
    })

    describe("greeting", () => {
        const mockRes = { json: jest.fn() }
        const mockReq = {
            requestId: "test123",
            body: { sid: "1000", u: { name: "Player1" }, v: 1, ni: "info" },
        }

        it("should return error if no session ID", async () => {
            await greeting({ requestId: "test", body: {} }, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "No session",
            })
        })

        it("should send greeting message to opponent", async () => {
            await greeting(mockReq, mockRes)

            expect(sendMessage).toHaveBeenCalledWith(
                1000n,
                "greeting",
                { u: { name: "Player1" }, v: 1, ni: "info" }
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })
    })

    describe("fieldRequest", () => {
        const mockRes = { json: jest.fn() }

        it("should send fldreq message", async () => {
            const req = { requestId: "test", body: { sid: "1001" } }

            await fieldRequest(req, mockRes)

            expect(sendMessage).toHaveBeenCalledWith(1001n, "fldreq", {})
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })
    })

    describe("fieldInfo", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if no json data", async () => {
            const req = { requestId: "test", body: { sid: "1000" } }

            await fieldInfo(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Invalid request",
            })
        })

        it("should store field and send fldinfo message", async () => {
            // 1. storeFieldData - SELECT game_sessions
            mockConnection.execute.mockResolvedValueOnce([
                [{ user_one_id: 10, user_two_id: 20 }],
            ])
            // 2. storeFieldData - INSERT gamefields
            mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }])
            // 3. getSessionPlayersInfo - SELECT with ranks
            mockConnection.execute.mockResolvedValueOnce([
                [
                    {
                        user_one_id: 10,
                        user_two_id: 20,
                        rank_one: 3,
                        rank_two: 5,
                    },
                ],
            ])

            const req = {
                requestId: "test",
                body: { sid: "1000", json: { ships: [] } },
            }

            await fieldInfo(req, mockRes)

            // Now includes bns object
            expect(sendMessage).toHaveBeenCalledWith(
                1000n,
                "fldinfo",
                expect.objectContaining({
                    json: { ships: [] },
                    bns: expect.objectContaining({
                        type: "bns",
                        gbc: expect.any(Array),
                        gbs: expect.any(Array),
                    }),
                })
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })

        it("should return error if session not found", async () => {
            mockConnection.execute.mockResolvedValueOnce([[]])

            const req = {
                requestId: "test",
                body: { sid: "1000", json: { ships: [] } },
            }

            await fieldInfo(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                errcode: 5,
                reason: "Session not found",
            })
        })

        it("should inject bns object with correct values when forwarding fldinfo", async () => {
            // 1. storeFieldData - SELECT game_sessions
            mockConnection.execute.mockResolvedValueOnce([
                [{ user_one_id: 10, user_two_id: 20 }],
            ])
            // 2. storeFieldData - INSERT gamefields
            mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }])
            // 3. getSessionPlayersInfo - SELECT with ranks
            // Player 0 (user 10) has rank 3, Player 1 (user 20) has rank 7
            mockConnection.execute.mockResolvedValueOnce([
                [
                    {
                        user_one_id: 10,
                        user_two_id: 20,
                        rank_one: 3,
                        rank_two: 7,
                    },
                ],
            ])

            const req = {
                requestId: "test",
                body: { sid: "1000", json: { ships: [] } }, // Player 0 sends field
            }

            await fieldInfo(req, mockRes)

            // Player 0 (rank 3) sends to Player 1 (rank 7)
            // So opponent (Player 1) has myRank=7, opponentRank=3
            // WIN bonus for player 1 = 9 + (3 - 7) = 9 + (-4) = 5
            // All values are encoded with val2mess()
            expect(sendMessage).toHaveBeenCalledWith(
                1000n,
                "fldinfo",
                expect.objectContaining({
                    json: { ships: [] },
                    bns: {
                        type: "bns",
                        gbc: [
                            val2mess(5),
                            val2mess(-1),
                            val2mess(2),
                            val2mess(-2),
                            val2mess(1),
                            val2mess(0),
                            val2mess(0),
                            val2mess(2),
                        ],
                        gbs: [
                            val2mess(4),
                            val2mess(0),
                            val2mess(1),
                            val2mess(0),
                            val2mess(1),
                            val2mess(0),
                            val2mess(0),
                            val2mess(0),
                        ],
                    },
                })
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })
    })

    describe("shoot", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if no coordinates", async () => {
            const req = { requestId: "test", body: { sid: "1000" } }

            await shoot(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Invalid shoot request",
            })
        })

        it("should increment move count and send shoot message", async () => {
            pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }])

            const req = {
                requestId: "test",
                body: { sid: "1000", cx: 5, cy: 3 },
            }

            await shoot(req, mockRes)

            expect(pool.execute).toHaveBeenCalledWith(
                expect.stringContaining("UPDATE game_sessions"),
                ["1000"]
            )
            expect(sendMessage).toHaveBeenCalledWith(1000n, "shoot", {
                cx: 5,
                cy: 3,
                json: undefined,
            })
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })
    })

    describe("yourTurn", () => {
        const mockRes = { json: jest.fn() }

        it("should send yourturn message", async () => {
            const req = {
                requestId: "test",
                body: { sid: "1001", time: 5000 },
            }

            await yourTurn(req, mockRes)

            expect(sendMessage).toHaveBeenCalledWith(1001n, "yourturn", {
                time: 5000,
            })
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })
    })

    describe("info", () => {
        const mockRes = { json: jest.fn() }

        it("should send info message", async () => {
            const req = {
                requestId: "test",
                body: { sid: "1000", msg: "Hello" },
            }

            await info(req, mockRes)

            expect(sendMessage).toHaveBeenCalledWith(1000n, "info", {
                msg: "Hello",
            })
        })
    })

    describe("chat", () => {
        const mockRes = { json: jest.fn() }

        it("should send chat message", async () => {
            const req = {
                requestId: "test",
                body: { sid: "1000", msg: "GG" },
            }

            await chat(req, mockRes)

            expect(sendMessage).toHaveBeenCalledWith(1000n, "chat", {
                msg: "GG",
            })
        })
    })

    describe("finish", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
            mockConnection.execute.mockReset()
            mockConnection.beginTransaction.mockReset()
            mockConnection.commit.mockReset()
            mockConnection.rollback.mockReset()
        })

        it("should return error if session not found", async () => {
            mockConnection.execute
                .mockResolvedValueOnce([]) // SET TRANSACTION ISOLATION LEVEL
                .mockResolvedValueOnce([[]]) // SELECT game_sessions FOR UPDATE

            const req = {
                requestId: "test",
                body: { sid: "1000", won: true, score: 100 },
            }

            await finish(req, mockRes)

            expect(mockConnection.rollback).toHaveBeenCalled()
            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                errcode: 5,
                reason: "Session not found",
            })
        })

        it("should update stats and finish game with coin calculation", async () => {
            const gameSession = {
                id: 1000,
                status: 1, // IN_PROGRESS
                user_one_id: 10,
                user_two_id: 20,
                version_one: 2100,
                version_two: 2100,
            }

            const mockUser = {
                id: 10,
                name: "Winner",
                uuid: "uuid-10",
                rank: 3,
                stars: 100,
                games: 50,
                gameswon: 25,
                coins: 120,
                games_android: 10,
                games_bluetooth: 5,
                games_web: 30,
                games_passplay: 5,
                wins_android: 5,
                wins_bluetooth: 2,
                wins_web: 15,
                wins_passplay: 3,
            }

            mockConnection.execute
                .mockResolvedValueOnce([]) // SET TRANSACTION ISOLATION LEVEL
                .mockResolvedValueOnce([[gameSession]]) // SELECT game_sessions FOR UPDATE
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE game_sessions
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users (winner stats)
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users (loser stats)
                .mockResolvedValueOnce([
                    [
                        { id: 10, rank: 3 },
                        { id: 20, rank: 5 },
                    ],
                ]) // SELECT ranks for coin calc
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE coins (winner)
                .mockResolvedValueOnce([[{ coins: 120 }]]) // SELECT new balance (winner)
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE coins (loser)
                .mockResolvedValueOnce([[{ coins: 99 }]]) // SELECT new balance (loser)
                .mockResolvedValueOnce([[mockUser]]) // SELECT user for buildMdfMessage

            const req = {
                requestId: "test",
                body: { sid: "1000", won: true, sc: { score: 100 } },
            }

            await finish(req, mockRes)

            expect(mockConnection.commit).toHaveBeenCalled()
            expect(sendMessage).toHaveBeenCalledWith(1000n, "fin", {
                won: true,
                u: undefined,
                sc: { score: 100 },
                wpl: undefined,
                ni: undefined,
                gsi: undefined,
                sur: undefined,
            })
            // done is returned directly, not { type: "ok" }
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "done",
                    cc: 120, // winner's coins (PLAIN)
                })
            )
        })

        it("should skip stats update if game already finished", async () => {
            const gameSession = {
                id: 1000,
                status: 4, // FINISHED_SURRENDERED - already finished by surrender
                user_one_id: 10,
                user_two_id: 20,
                version_one: 2100,
                version_two: 2100,
            }

            const mockUser = {
                id: 10,
                name: "Player",
                uuid: "uuid-10",
                rank: 3,
                stars: 100,
                games: 50,
                gameswon: 25,
                coins: 150,
                games_android: 10,
                games_bluetooth: 5,
                games_web: 30,
                games_passplay: 5,
                wins_android: 5,
                wins_bluetooth: 2,
                wins_web: 15,
                wins_passplay: 3,
            }

            mockConnection.execute
                .mockResolvedValueOnce([]) // SET TRANSACTION ISOLATION LEVEL
                .mockResolvedValueOnce([[gameSession]]) // SELECT game_sessions FOR UPDATE
                .mockResolvedValueOnce([[{ coins: 150 }]]) // SELECT coins for this user
                .mockResolvedValueOnce([[mockUser]]) // SELECT user for buildMdfMessage

            const req = {
                requestId: "test",
                body: { sid: "1000", won: true, sc: { score: 100 } },
            }

            await finish(req, mockRes)

            expect(mockConnection.commit).toHaveBeenCalled()
            // done is returned directly even for already finished games
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "done",
                    cc: 150, // current coins (PLAIN)
                })
            )
        })
    })

    describe("dutchMove", () => {
        const mockRes = { json: jest.fn() }

        it("should send dutch message", async () => {
            const req = {
                requestId: "test",
                body: { sid: "1000", ocx: 1, ocy: 2, ncx: 3, ncy: 4, or: 0 },
            }

            await dutchMove(req, mockRes)

            expect(sendMessage).toHaveBeenCalledWith(1000n, "dutch", {
                ocx: 1,
                ocy: 2,
                ncx: 3,
                ncy: 4,
                or: 0,
            })
        })
    })

    describe("shipMove", () => {
        const mockRes = { json: jest.fn() }

        it("should send smove message", async () => {
            const req = {
                requestId: "test",
                body: { sid: "1001", ship: { id: 1, dir: "up" } },
            }

            await shipMove(req, mockRes)

            expect(sendMessage).toHaveBeenCalledWith(1001n, "smove", {
                ship: { id: 1, dir: "up" },
            })
        })
    })
})
