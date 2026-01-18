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
        it("should create session", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbCreateSession(100000n, 1, 150, 1)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO game_sessions"),
                ["100000", 1, 150, 1]
            )
        })

        it("should return false on error", async () => {
            mockExecute.mockRejectedValue(new Error("Duplicate key"))

            const result = await dbCreateSession(1n, 1, 100, 1)

            expect(result).toBe(false)
        })
    })

    describe("dbFindWaitingSession", () => {
        it("should find waiting session", async () => {
            const mockSession = { id: 1000n, user_one_id: 5, status: 0 }
            mockExecute.mockResolvedValue([[mockSession]])

            const result = await dbFindWaitingSession(10, 1)

            expect(result).toEqual(mockSession)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("WHERE gs.status = 0"),
                [10, 1]
            )
        })

        it("should return null when no waiting session", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbFindWaitingSession(1, 1)

            expect(result).toBeNull()
        })

        it("should use provided connection", async () => {
            const mockConn = { execute: jest.fn().mockResolvedValue([[]]) }

            await dbFindWaitingSession(1, 1, mockConn)

            expect(mockConn.execute).toHaveBeenCalled()
            expect(mockExecute).not.toHaveBeenCalled()
        })
    })

    describe("dbJoinSession", () => {
        it("should join session as player two", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbJoinSession(12345n, 2, 150)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("user_two_id = ?"),
                [2, 150, "12345"]
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
})
