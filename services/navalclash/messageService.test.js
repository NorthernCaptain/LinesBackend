/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockExecute = jest.fn()
const mockDbUpdatePlayerLastSeen = jest.fn().mockResolvedValue(true)
const mockDbGetOpponentLastSeen = jest.fn().mockResolvedValue(null)
const mockDbCloseStaleSession = jest.fn().mockResolvedValue(0)

jest.mock("../../db/navalclash", () => ({
    pool: {
        execute: mockExecute,
    },
    dbUpdatePlayerLastSeen: (...args) => mockDbUpdatePlayerLastSeen(...args),
    dbGetOpponentLastSeen: (...args) => mockDbGetOpponentLastSeen(...args),
    dbCloseStaleSession: (...args) => mockDbCloseStaleSession(...args),
}))

jest.mock("cluster", () => ({
    isWorker: false,
    isMaster: true,
}))

const {
    poll,
    send,
    sendMessage,
    getOpponentSessionId,
    fetchNextMessage,
    deleteAcknowledgedMessages,
    getPendingPollCount,
    clearPendingPolls,
    checkDeadOpponent,
} = require("./messageService")

describe("services/navalclash/messageService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
        clearPendingPolls()
    })

    describe("getOpponentSessionId", () => {
        it("should flip the last bit for even session ID", () => {
            expect(getOpponentSessionId(1000n)).toBe(1001n)
            expect(getOpponentSessionId(2000n)).toBe(2001n)
        })

        it("should flip the last bit for odd session ID", () => {
            expect(getOpponentSessionId(1001n)).toBe(1000n)
            expect(getOpponentSessionId(2001n)).toBe(2000n)
        })
    })

    describe("fetchNextMessage", () => {
        it("should fetch message from opponent", async () => {
            const mockMessage = {
                msg_id: 1,
                msg_type: "greeting",
                body: JSON.stringify({ hello: "world" }),
                created_at: new Date(),
            }
            mockExecute.mockResolvedValueOnce([[mockMessage]])

            const result = await fetchNextMessage(1001n, 0n)

            expect(result).toEqual({
                msg_id: 1,
                msg_type: "greeting",
                body: { hello: "world" },
            })
            // Should query for opponent's messages (1001 ^ 1 = 1000)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("sender_session_id = ?"),
                ["1000", "0"]
            )
        })

        it("should return null when no messages", async () => {
            mockExecute.mockResolvedValueOnce([[]])

            const result = await fetchNextMessage(1001n, 0n)

            expect(result).toBeNull()
        })

        it("should parse JSON body if string", async () => {
            const mockMessage = {
                msg_id: 1,
                msg_type: "shoot",
                body: '{"cx": 5, "cy": 3}',
            }
            mockExecute.mockResolvedValueOnce([[mockMessage]])

            const result = await fetchNextMessage(1000n, 0n)

            expect(result.body).toEqual({ cx: 5, cy: 3 })
        })

        it("should use body as-is if already object", async () => {
            const mockMessage = {
                msg_id: 1,
                msg_type: "shoot",
                body: { cx: 5, cy: 3 },
            }
            mockExecute.mockResolvedValueOnce([[mockMessage]])

            const result = await fetchNextMessage(1000n, 0n)

            expect(result.body).toEqual({ cx: 5, cy: 3 })
        })
    })

    describe("deleteAcknowledgedMessages", () => {
        it("should delete messages from opponent up to specified ID", async () => {
            mockExecute.mockResolvedValueOnce([{ affectedRows: 5 }])

            await deleteAcknowledgedMessages(1001n, 10n)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("DELETE FROM session_messages"),
                ["1000", "10"]
            )
        })
    })

    describe("sendMessage", () => {
        it("should insert message and return ID", async () => {
            mockExecute.mockResolvedValueOnce([{ insertId: 42 }])

            const result = await sendMessage(1000n, "greeting", {
                hello: "world",
            })

            expect(result).toBe(42)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO session_messages"),
                ["1000", "greeting", '{"hello":"world"}']
            )
        })
    })

    describe("checkDeadOpponent", () => {
        it("should return null for WAITING session", async () => {
            mockDbGetOpponentLastSeen.mockResolvedValueOnce({
                status: 0,
                opponent_last_seen: null,
            })

            const result = await checkDeadOpponent(1000n, 0, {})

            expect(result).toBeNull()
        })

        it("should return errcode 5 for closed session (FINISHED_NOT_PINGABLE)", async () => {
            mockDbGetOpponentLastSeen.mockResolvedValueOnce({
                status: 9, // FINISHED_NOT_PINGABLE
                opponent_last_seen: null,
            })

            const result = await checkDeadOpponent(1000n, 0, {})

            expect(result).toEqual({
                type: "error",
                errcode: 5,
                reason: "Session terminated",
            })
        })

        it("should return errcode 5 for closed session (FINISHED_OK)", async () => {
            mockDbGetOpponentLastSeen.mockResolvedValueOnce({
                status: 10, // FINISHED_OK
                opponent_last_seen: null,
            })

            const result = await checkDeadOpponent(1000n, 0, {})

            expect(result).toEqual({
                type: "error",
                errcode: 5,
                reason: "Session terminated",
            })
        })

        it("should return null when opponent never polled (just joined)", async () => {
            mockDbGetOpponentLastSeen.mockResolvedValueOnce({
                status: 1,
                opponent_last_seen: null,
                user_one_id: 1,
                user_two_id: 2,
            })

            const result = await checkDeadOpponent(1000n, 0, {})

            expect(result).toBeNull()
        })

        it("should return null when opponent is alive", async () => {
            mockDbGetOpponentLastSeen.mockResolvedValueOnce({
                status: 1,
                opponent_last_seen: new Date(), // Just now
                user_one_id: 1,
                user_two_id: 2,
            })

            const result = await checkDeadOpponent(1000n, 0, {})

            expect(result).toBeNull()
        })

        it("should close session and return left message when opponent is dead", async () => {
            const staleTime = new Date(Date.now() - 60000) // 60 seconds ago
            mockDbGetOpponentLastSeen.mockResolvedValueOnce({
                status: 1,
                opponent_last_seen: staleTime,
                user_one_id: 1,
                user_two_id: 2,
            })
            mockDbCloseStaleSession.mockResolvedValueOnce(1)

            const result = await checkDeadOpponent(1000n, 0, {})

            expect(result).toBeTruthy()
            expect(result.type).toBe("info")
            expect(result.msg.m).toBe(5) // MSG.LEFT_SCREEN
            expect(mockDbCloseStaleSession).toHaveBeenCalledWith(1000n, 9) // FINISHED_NOT_PINGABLE
        })

        it("should return null when session already closed by another path", async () => {
            const staleTime = new Date(Date.now() - 60000)
            mockDbGetOpponentLastSeen.mockResolvedValueOnce({
                status: 1,
                opponent_last_seen: staleTime,
                user_one_id: 1,
                user_two_id: 2,
            })
            mockDbCloseStaleSession.mockResolvedValueOnce(0) // Already closed

            const result = await checkDeadOpponent(1000n, 0, {})

            expect(result).toBeNull()
        })

        it("should return null when session not found", async () => {
            mockDbGetOpponentLastSeen.mockResolvedValueOnce(null)

            const result = await checkDeadOpponent(9999n, 0, {})

            expect(result).toBeNull()
        })
    })

    describe("poll", () => {
        const mockRes = {
            json: jest.fn(),
        }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if no session ID", async () => {
            const req = { body: {} }

            await poll(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "No session ID",
            })
        })

        it("should update player last_seen on each poll", async () => {
            const mockMessage = {
                msg_id: 5,
                msg_type: "greeting",
                body: JSON.stringify({ u: { name: "Test" } }),
            }
            mockExecute.mockResolvedValueOnce([[mockMessage]]) // fetch message

            const req = { body: { sid: "1001" } }

            await poll(req, mockRes)

            // Player 1 (odd session ID), base session = 1000
            expect(mockDbUpdatePlayerLastSeen).toHaveBeenCalledWith(
                1000n,
                1
            )
        })

        it("should return message immediately if available", async () => {
            const mockMessage = {
                msg_id: 5,
                msg_type: "greeting",
                body: JSON.stringify({ u: { name: "Test" } }),
            }
            mockExecute.mockResolvedValueOnce([[mockMessage]]) // fetch message

            const req = { body: { sid: "1001" } }

            await poll(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "greeting",
                msgId: "5",
                u: { name: "Test" },
            })
        })

        it("should check for dead opponent when no message available", async () => {
            // No message available
            mockExecute.mockResolvedValueOnce([[]]) // fetch message - empty
            mockDbGetOpponentLastSeen.mockResolvedValueOnce({
                status: 1,
                opponent_last_seen: new Date(Date.now() - 60000), // 60s ago
                user_one_id: 1,
                user_two_id: 2,
            })
            mockDbCloseStaleSession.mockResolvedValueOnce(1)

            const req = { body: { sid: "1001" } }

            await poll(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "info",
                    msg: expect.objectContaining({ m: 5 }),
                })
            )
        })

        it("should delete acknowledged messages if after is provided", async () => {
            mockExecute
                .mockResolvedValueOnce([{ affectedRows: 2 }]) // delete
                .mockResolvedValueOnce([
                    [{ msg_id: 10, msg_type: "ok", body: "{}" }],
                ]) // fetch

            const req = { body: { sid: "1001", after: "5" } }

            await poll(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("DELETE FROM session_messages"),
                ["1000", "5"]
            )
        })

        it("should handle database errors", async () => {
            mockDbUpdatePlayerLastSeen.mockRejectedValueOnce(
                new Error("DB error")
            )

            const req = { body: { sid: "1001" } }

            await poll(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Server error",
            })
        })
    })

    describe("send", () => {
        const mockRes = {
            json: jest.fn(),
        }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if no session ID", async () => {
            const req = { body: { msgType: "greeting" } }

            await send(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "No session ID",
            })
        })

        it("should return error if no message type", async () => {
            const req = { body: { sid: "1000" } }

            await send(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "No message type",
            })
        })

        it("should update player last_seen on send", async () => {
            mockExecute.mockResolvedValueOnce([{ insertId: 123 }])

            const req = {
                body: {
                    sid: "1000",
                    msgType: "greeting",
                    u: { name: "Player" },
                },
            }

            await send(req, mockRes)

            // Player 0 (even session ID), base session = 1000
            expect(mockDbUpdatePlayerLastSeen).toHaveBeenCalledWith(
                1000n,
                0
            )
        })

        it("should send message and return ok with msgId", async () => {
            mockExecute.mockResolvedValueOnce([{ insertId: 123 }])

            const req = {
                body: {
                    sid: "1000",
                    msgType: "greeting",
                    u: { name: "Player" },
                },
            }

            await send(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "ok",
                msgId: "123",
            })
        })

        it("should handle database errors", async () => {
            mockDbUpdatePlayerLastSeen.mockRejectedValueOnce(
                new Error("DB error")
            )

            const req = {
                body: { sid: "1000", msgType: "greeting" },
            }

            await send(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Server error",
            })
        })
    })

    describe("getPendingPollCount", () => {
        it("should return 0 initially", () => {
            expect(getPendingPollCount()).toBe(0)
        })
    })

    describe("clearPendingPolls", () => {
        it("should clear all pending polls", () => {
            // Just ensure it doesn't throw
            expect(() => clearPendingPolls()).not.toThrow()
            expect(getPendingPollCount()).toBe(0)
        })
    })
})
