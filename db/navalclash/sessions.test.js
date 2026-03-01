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
    SESSION_STATUS,
    dbFindSessionById,
    dbCreateSession,
    dbFindWaitingSession,
    dbJoinSession,
    dbFinishSession,
    dbIncrementMoves,
    dbGetConfig,
    dbTerminateUserSessions,
    dbUpdatePlayerLastSeen,
    dbGetOpponentLastSeen,
    dbCloseStaleSession,
    dbFindStaleSessions,
} = require("./sessions")

describe("db/navalclash/sessions", () => {
    beforeEach(() => {
        mockExecute.mockReset()
    })

    describe("dbFindSessionById", () => {
        it("should return session when found", async () => {
            const mockSession = { id: 12345n, status: 1 }
            mockExecute.mockResolvedValue([[mockSession]])

            const result = await dbFindSessionById(12345n)

            expect(result).toEqual(mockSession)
            expect(mockExecute).toHaveBeenCalledWith(
                "SELECT * FROM game_sessions WHERE id = ?",
                ["12345"]
            )
        })

        it("should return null when not found", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbFindSessionById(99999n)

            expect(result).toBeNull()
        })

        it("should handle string sessionId", async () => {
            mockExecute.mockResolvedValue([[{ id: "12345" }]])

            await dbFindSessionById("12345")

            expect(mockExecute).toHaveBeenCalledWith(expect.any(String), [
                "12345",
            ])
        })
    })

    describe("dbCreateSession", () => {
        it("should create session with last_seen_one", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbCreateSession(100000n, 1, 150, 1)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO game_sessions"),
                ["100000", 1, 150, 1]
            )
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("last_seen_one"),
                expect.any(Array)
            )
        })

        it("should return false on error", async () => {
            mockExecute.mockRejectedValue(new Error("Duplicate key"))

            const result = await dbCreateSession(1n, 1, 100, 1)

            expect(result).toBe(false)
        })
    })

    describe("dbFindWaitingSession", () => {
        it("should find waiting session using last_seen_one filter", async () => {
            const mockSession = { id: 1000n, user_one_id: 5, status: 0 }
            mockExecute.mockResolvedValue([[mockSession]])

            const result = await dbFindWaitingSession(10, 1, 100, null)

            expect(result).toEqual(mockSession)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("last_seen_one > DATE_SUB"),
                [10, 1]
            )
        })

        it("should not use updated_at for staleness check", async () => {
            mockExecute.mockResolvedValue([[]])

            await dbFindWaitingSession(10, 1, 100, null)

            const query = mockExecute.mock.calls[0][0]
            expect(query).not.toContain("updated_at > DATE_SUB")
        })

        it("should return null when no waiting session", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbFindWaitingSession(1, 1, 100, null)

            expect(result).toBeNull()
        })

        it("should use provided connection", async () => {
            const mockConn = { execute: jest.fn().mockResolvedValue([[]]) }

            await dbFindWaitingSession(1, 1, 100, mockConn)

            expect(mockConn.execute).toHaveBeenCalled()
            expect(mockExecute).not.toHaveBeenCalled()
        })

        it("should filter out agent sessions when agent is joining", async () => {
            const mockSession = { id: 1000n, user_one_id: 5, status: 0 }
            mockExecute.mockResolvedValue([[mockSession]])

            // Agent version (2150) joining
            await dbFindWaitingSession(10, 1, 2150, null)

            // Should include agent version filter in query
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("version_one < ?"),
                [10, 1, 2100, 2200]
            )
        })

        it("should not filter agent sessions when human is joining", async () => {
            mockExecute.mockResolvedValue([[]])

            // Human version (100) joining
            await dbFindWaitingSession(10, 1, 100, null)

            // Should NOT include agent version filter
            expect(mockExecute).toHaveBeenCalledWith(
                expect.not.stringContaining("version_one < ?"),
                [10, 1]
            )
        })
    })

    describe("dbJoinSession", () => {
        it("should join session with last_seen_two", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbJoinSession(12345n, 2, 150)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("user_two_id = ?"),
                [2, 150, "12345"]
            )
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("last_seen_two"),
                expect.any(Array)
            )
        })

        it("should use provided connection", async () => {
            const mockConn = {
                execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
            }

            const result = await dbJoinSession(1n, 2, 100, mockConn)

            expect(result).toBe(true)
            expect(mockConn.execute).toHaveBeenCalled()
        })
    })

    describe("dbFinishSession", () => {
        it("should finish session with winner", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbFinishSession(12345n, 10, 1, 500)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("status = ?"),
                [10, 1, 500, "12345"]
            )
        })

        it("should handle null winner and score", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbFinishSession(1n, 11, null, null)

            expect(result).toBe(true)
        })
    })

    describe("dbIncrementMoves", () => {
        it("should increment moves_one for player 0", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbIncrementMoves(12345n, 0)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("moves_one = moves_one + 1"),
                ["12345"]
            )
        })

        it("should increment moves_two for player 1", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbIncrementMoves(12345n, 1)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("moves_two = moves_two + 1"),
                ["12345"]
            )
        })
    })

    describe("dbGetConfig", () => {
        it("should return config value", async () => {
            const mockConfig = { name: "maintenance_mode", int_value: 0 }
            mockExecute.mockResolvedValue([[mockConfig]])

            const result = await dbGetConfig("maintenance_mode")

            expect(result).toEqual(mockConfig)
        })

        it("should return null when config not found", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbGetConfig("unknown_config")

            expect(result).toBeNull()
        })
    })

    describe("SESSION_STATUS", () => {
        it("should export session status constants", () => {
            expect(SESSION_STATUS.WAITING).toBe(0)
            expect(SESSION_STATUS.IN_PROGRESS).toBe(1)
            expect(SESSION_STATUS.FINISHED_OK).toBe(10)
            expect(SESSION_STATUS.FINISHED_TERMINATED_DUPLICATE).toBe(7)
        })
    })

    describe("dbTerminateUserSessions", () => {
        it("should terminate active sessions for user", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 2 }])

            const result = await dbTerminateUserSessions(1)

            expect(result).toBe(2)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("status = ?"),
                [SESSION_STATUS.FINISHED_TERMINATED_DUPLICATE, 1, 1]
            )
        })

        it("should return 0 when no sessions terminated", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 0 }])

            const result = await dbTerminateUserSessions(999)

            expect(result).toBe(0)
        })

        it("should use provided connection", async () => {
            const mockConn = {
                execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
            }

            const result = await dbTerminateUserSessions(1, mockConn)

            expect(result).toBe(1)
            expect(mockConn.execute).toHaveBeenCalled()
        })

        it("should return 0 on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbTerminateUserSessions(1)

            expect(result).toBe(0)
        })
    })

    describe("dbUpdatePlayerLastSeen", () => {
        it("should update last_seen_one for player 0", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbUpdatePlayerLastSeen(1000n, 0)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("last_seen_one = NOW(3)"),
                ["1000"]
            )
        })

        it("should update last_seen_two for player 1", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbUpdatePlayerLastSeen(1000n, 1)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("last_seen_two = NOW(3)"),
                ["1000"]
            )
        })

        it("should only update active sessions", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 0 }])

            await dbUpdatePlayerLastSeen(1000n, 0)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("status <= 1"),
                expect.any(Array)
            )
        })

        it("should return false on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbUpdatePlayerLastSeen(1000n, 0)

            expect(result).toBe(false)
        })
    })

    describe("dbGetOpponentLastSeen", () => {
        it("should get last_seen_two when player is 0", async () => {
            mockExecute.mockResolvedValue([
                [
                    {
                        status: 1,
                        opponent_last_seen: new Date(),
                        user_one_id: 1,
                        user_two_id: 2,
                    },
                ],
            ])

            const result = await dbGetOpponentLastSeen(1000n, 0)

            expect(result).toBeTruthy()
            expect(result.status).toBe(1)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("last_seen_two as opponent_last_seen"),
                ["1000"]
            )
        })

        it("should get last_seen_one when player is 1", async () => {
            mockExecute.mockResolvedValue([
                [
                    {
                        status: 1,
                        opponent_last_seen: new Date(),
                        user_one_id: 1,
                        user_two_id: 2,
                    },
                ],
            ])

            const result = await dbGetOpponentLastSeen(1000n, 1)

            expect(result).toBeTruthy()
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("last_seen_one as opponent_last_seen"),
                ["1000"]
            )
        })

        it("should return null when session not found", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbGetOpponentLastSeen(9999n, 0)

            expect(result).toBeNull()
        })

        it("should return null on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbGetOpponentLastSeen(1000n, 0)

            expect(result).toBeNull()
        })
    })

    describe("dbCloseStaleSession", () => {
        it("should close active session with given status", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbCloseStaleSession(1000n, 9)

            expect(result).toBe(1)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("status = ?"),
                [9, "1000"]
            )
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("AND status <= 1"),
                expect.any(Array)
            )
        })

        it("should return 0 when session already closed", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 0 }])

            const result = await dbCloseStaleSession(1000n, 9)

            expect(result).toBe(0)
        })

        it("should return 0 on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbCloseStaleSession(1000n, 9)

            expect(result).toBe(0)
        })
    })

    describe("dbFindStaleSessions", () => {
        it("should find stale sessions", async () => {
            const staleSessions = [
                { id: "1000", status: 0, last_seen_one: null },
                { id: "2000", status: 1, last_seen_one: null },
            ]
            mockExecute.mockResolvedValue([staleSessions])

            const result = await dbFindStaleSessions(120)

            expect(result).toHaveLength(2)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("status <= 1"),
                [120, 120, 120]
            )
        })

        it("should return empty array on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbFindStaleSessions(120)

            expect(result).toEqual([])
        })

        it("should return empty array when no stale sessions", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbFindStaleSessions(120)

            expect(result).toEqual([])
        })
    })
})
