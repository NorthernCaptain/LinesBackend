/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockExecute = jest.fn()

jest.mock("../../db/navalclash/pool", () => ({
    pool: {
        execute: mockExecute,
    },
}))

const {
    purgeStaleSessions,
    startSessionPurge,
    stopSessionPurge,
} = require("./sessionPurge")

describe("services/navalclash/sessionPurge", () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        stopSessionPurge()
    })

    describe("purgeStaleSessions", () => {
        it("should close stale waiting sessions with FINISHED_TIMED_OUT_WAITING", async () => {
            // Find stale waiting sessions
            mockExecute
                .mockResolvedValueOnce([[{ id: "1000" }]]) // stale waiting
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // close it
                .mockResolvedValueOnce([[]]) // no stale playing
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // message cleanup

            const closed = await purgeStaleSessions(120)

            expect(closed).toBe(1)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("status = 0"),
                [120]
            )
            // Should close with status 5 (FINISHED_TIMED_OUT_WAITING)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("status = ?"),
                [5, "1000"]
            )
        })

        it("should close stale playing sessions with FINISHED_TIMED_OUT_PLAYING", async () => {
            // No stale waiting sessions
            mockExecute
                .mockResolvedValueOnce([[]]) // no stale waiting
                .mockResolvedValueOnce([[{ id: "2000" }]]) // stale playing
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // close it
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // message cleanup

            const closed = await purgeStaleSessions(120)

            expect(closed).toBe(1)
            // Should close with status 6 (FINISHED_TIMED_OUT_PLAYING)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("status = ?"),
                [6, "2000"]
            )
        })

        it("should handle multiple stale sessions", async () => {
            mockExecute
                .mockResolvedValueOnce([
                    [{ id: "1000" }, { id: "1002" }],
                ]) // 2 stale waiting
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // close 1000
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // close 1002
                .mockResolvedValueOnce([[{ id: "2000" }]]) // 1 stale playing
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // close 2000
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // message cleanup

            const closed = await purgeStaleSessions(120)

            expect(closed).toBe(3)
        })

        it("should return 0 when no stale sessions", async () => {
            mockExecute
                .mockResolvedValueOnce([[]]) // no stale waiting
                .mockResolvedValueOnce([[]]) // no stale playing
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // message cleanup

            const closed = await purgeStaleSessions(120)

            expect(closed).toBe(0)
        })

        it("should not count already-closed sessions", async () => {
            mockExecute
                .mockResolvedValueOnce([[{ id: "1000" }]]) // stale waiting
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // already closed
                .mockResolvedValueOnce([[]]) // no stale playing
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // message cleanup

            const closed = await purgeStaleSessions(120)

            expect(closed).toBe(0)
        })

        it("should handle database errors gracefully", async () => {
            mockExecute.mockRejectedValueOnce(new Error("DB connection lost"))

            const closed = await purgeStaleSessions(120)

            expect(closed).toBe(0)
        })
    })

    describe("startSessionPurge / stopSessionPurge", () => {
        it("should start without throwing", () => {
            expect(() => startSessionPurge()).not.toThrow()
        })

        it("should stop without throwing", () => {
            startSessionPurge()
            expect(() => stopSessionPurge()).not.toThrow()
        })

        it("should be safe to stop when not started", () => {
            expect(() => stopSessionPurge()).not.toThrow()
        })
    })
})
