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
    dbInsertMessage,
    dbFetchNextMessage,
    dbDeleteAcknowledgedMessages,
    dbDeleteOldMessages,
    getOpponentSessionId,
} = require("./messages")

describe("db/navalclash/messages", () => {
    beforeEach(() => {
        mockExecute.mockReset()
    })

    describe("getOpponentSessionId", () => {
        it("should flip last bit (even to odd)", () => {
            expect(getOpponentSessionId(100n)).toBe(101n)
            expect(getOpponentSessionId(1000n)).toBe(1001n)
        })

        it("should flip last bit (odd to even)", () => {
            expect(getOpponentSessionId(101n)).toBe(100n)
            expect(getOpponentSessionId(1001n)).toBe(1000n)
        })

        it("should work with large session IDs", () => {
            const largeEven = 281474976710656n // 2^48
            expect(getOpponentSessionId(largeEven)).toBe(largeEven + 1n)
            expect(getOpponentSessionId(largeEven + 1n)).toBe(largeEven)
        })
    })

    describe("dbInsertMessage", () => {
        it("should insert message and return insertId", async () => {
            mockExecute.mockResolvedValue([{ insertId: 42 }])

            const result = await dbInsertMessage(100n, "greeting", {
                msg: "Hello",
            })

            expect(result).toBe(42)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO session_messages"),
                ["100", "greeting", '{"msg":"Hello"}']
            )
        })

        it("should handle string sessionId", async () => {
            mockExecute.mockResolvedValue([{ insertId: 1 }])

            await dbInsertMessage("12345", "shoot", { x: 1, y: 2 })

            expect(mockExecute).toHaveBeenCalledWith(expect.any(String), [
                "12345",
                "shoot",
                '{"x":1,"y":2}',
            ])
        })

        it("should return null on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbInsertMessage(1n, "test", {})

            expect(result).toBeNull()
        })
    })

    describe("dbFetchNextMessage", () => {
        it("should fetch next message from opponent", async () => {
            const mockRow = {
                msg_id: 5,
                msg_type: "shoot",
                body: '{"x":3,"y":4}',
            }
            mockExecute.mockResolvedValue([[mockRow]])

            // Receiver is 100 (even/player 0), opponent is 101 (odd/player 1)
            const result = await dbFetchNextMessage(100n, 0n)

            expect(result).toEqual({
                msg_id: 5,
                msg_type: "shoot",
                body: { x: 3, y: 4 },
            })
            // Should query for sender_session_id = opponent (101)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("sender_session_id = ?"),
                ["101", "0"]
            )
        })

        it("should return null when no message", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbFetchNextMessage(100n, 0n)

            expect(result).toBeNull()
        })

        it("should handle already-parsed JSON body", async () => {
            const mockRow = {
                msg_id: 1,
                msg_type: "chat",
                body: { msg: "Hi" }, // Already an object
            }
            mockExecute.mockResolvedValue([[mockRow]])

            const result = await dbFetchNextMessage(100n, 0n)

            expect(result.body).toEqual({ msg: "Hi" })
        })

        it("should return null on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbFetchNextMessage(100n, 0n)

            expect(result).toBeNull()
        })
    })

    describe("dbDeleteAcknowledgedMessages", () => {
        it("should delete messages from opponent", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 3 }])

            // Receiver is 100, opponent is 101
            const result = await dbDeleteAcknowledgedMessages(100n, 50n)

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("DELETE FROM session_messages"),
                ["101", "50"]
            )
        })

        it("should return false on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbDeleteAcknowledgedMessages(1n, 1n)

            expect(result).toBe(false)
        })
    })

    describe("dbDeleteOldMessages", () => {
        it("should delete old messages and return count", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 25 }])

            const result = await dbDeleteOldMessages(24, 100)

            expect(result).toBe(25)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INTERVAL ? HOUR"),
                [24, 100]
            )
        })

        it("should return 0 on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbDeleteOldMessages(1, 10)

            expect(result).toBe(0)
        })
    })
})
