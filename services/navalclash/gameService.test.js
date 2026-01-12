/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockExecute = jest.fn()
const mockGetConnection = jest.fn()
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
        getConnection: mockGetConnection,
    },
}))

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
} = require("./gameService")

const { sendMessage } = require("./messageService")

describe("services/navalclash/gameService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockGetConnection.mockResolvedValue(mockConnection)
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
            body: { sid: "1000", json: { name: "Player1" } },
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
                { json: { name: "Player1" } }
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
            mockConnection.execute
                .mockResolvedValueOnce([[{ user_one_id: 10, user_two_id: 20 }]])
                .mockResolvedValueOnce([{ affectedRows: 1 }])

            const req = {
                requestId: "test",
                body: { sid: "1000", json: { ships: [] } },
            }

            await fieldInfo(req, mockRes)

            expect(sendMessage).toHaveBeenCalledWith(1000n, "fldinfo", {
                json: { ships: [] },
            })
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
            mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }])

            const req = {
                requestId: "test",
                body: { sid: "1000", cx: 5, cy: 3 },
            }

            await shoot(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
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
                body: { sid: "1001", result: "hit" },
            }

            await yourTurn(req, mockRes)

            expect(sendMessage).toHaveBeenCalledWith(1001n, "yourturn", {
                result: "hit",
                json: undefined,
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
            mockConnection.execute.mockResolvedValueOnce([[]])

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

        it("should update stats and finish game", async () => {
            const gameSession = {
                id: 1000,
                status: 0,
                user_one_id: 10,
                user_two_id: 20,
            }

            mockConnection.execute
                .mockResolvedValueOnce([[gameSession]]) // SELECT
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE game_sessions
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users (winner)
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users (loser)

            const req = {
                requestId: "test",
                body: { sid: "1000", won: true, score: 100 },
            }

            await finish(req, mockRes)

            expect(mockConnection.commit).toHaveBeenCalled()
            expect(sendMessage).toHaveBeenCalledWith(1000n, "fin", {
                won: true,
                score: 100,
                json: undefined,
            })
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })

        it("should skip stats update if game already finished", async () => {
            const gameSession = {
                id: 1000,
                status: 10,
                user_one_id: 10,
                user_two_id: 20,
            }

            mockConnection.execute.mockResolvedValueOnce([[gameSession]])

            const req = {
                requestId: "test",
                body: { sid: "1000", won: true, score: 100 },
            }

            await finish(req, mockRes)

            expect(mockConnection.commit).toHaveBeenCalled()
            expect(mockConnection.execute).toHaveBeenCalledTimes(1) // Only SELECT
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })
    })

    describe("dutchMove", () => {
        const mockRes = { json: jest.fn() }

        it("should send dutch message", async () => {
            const req = {
                requestId: "test",
                body: { sid: "1000", json: { move: "forward" } },
            }

            await dutchMove(req, mockRes)

            expect(sendMessage).toHaveBeenCalledWith(1000n, "dutch", {
                json: { move: "forward" },
            })
        })
    })

    describe("shipMove", () => {
        const mockRes = { json: jest.fn() }

        it("should send smove message", async () => {
            const req = {
                requestId: "test",
                body: { sid: "1001", json: { ship: 1, dir: "up" } },
            }

            await shipMove(req, mockRes)

            expect(sendMessage).toHaveBeenCalledWith(1001n, "smove", {
                json: { ship: 1, dir: "up" },
            })
        })
    })
})
