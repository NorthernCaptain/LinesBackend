/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const {
    handleSubscribe,
    handleUnsubscribe,
    handlePublish,
    getOpponentSessionId,
    getActivePollCount,
    clearAllPolls,
} = require("./clusterBroker")

describe("services/navalclash/clusterBroker", () => {
    beforeEach(() => {
        clearAllPolls()
    })

    describe("getOpponentSessionId", () => {
        it("should flip the last bit for even session ID", () => {
            expect(getOpponentSessionId("1000")).toBe("1001")
            expect(getOpponentSessionId("2000")).toBe("2001")
        })

        it("should flip the last bit for odd session ID", () => {
            expect(getOpponentSessionId("1001")).toBe("1000")
            expect(getOpponentSessionId("2001")).toBe("2000")
        })

        it("should handle large session IDs", () => {
            const largeId = "115873854376116224"
            const expected = "115873854376116225"
            expect(getOpponentSessionId(largeId)).toBe(expected)
        })
    })

    describe("handleSubscribe", () => {
        it("should register a new poll", () => {
            const mockWorker = { id: 1, send: jest.fn() }
            const msg = {
                sessionId: "1000",
                pollId: 1,
                requestId: "req-1",
            }

            handleSubscribe(mockWorker, msg)

            expect(getActivePollCount()).toBe(1)
        })

        it("should replace older poll with newer pollId", () => {
            const mockWorker1 = { id: 1, send: jest.fn() }
            const mockWorker2 = { id: 2, send: jest.fn() }
            const cluster = require("cluster")
            cluster.workers = { 1: mockWorker1, 2: mockWorker2 }

            handleSubscribe(mockWorker1, {
                sessionId: "1000",
                pollId: 1,
                requestId: "req-1",
            })

            handleSubscribe(mockWorker2, {
                sessionId: "1000",
                pollId: 2,
                requestId: "req-2",
            })

            expect(getActivePollCount()).toBe(1)
            expect(mockWorker1.send).toHaveBeenCalledWith({
                nc: true,
                type: "CANCEL",
                requestId: "req-1",
            })
        })

        it("should cancel new poll if pollId is older", () => {
            const mockWorker1 = { id: 1, send: jest.fn() }
            const mockWorker2 = { id: 2, send: jest.fn() }

            handleSubscribe(mockWorker1, {
                sessionId: "1000",
                pollId: 2,
                requestId: "req-1",
            })

            handleSubscribe(mockWorker2, {
                sessionId: "1000",
                pollId: 1,
                requestId: "req-2",
            })

            expect(getActivePollCount()).toBe(1)
            expect(mockWorker2.send).toHaveBeenCalledWith({
                nc: true,
                type: "CANCEL",
                requestId: "req-2",
            })
        })

        it("should handle same pollId (update)", () => {
            const mockWorker = { id: 1, send: jest.fn() }

            handleSubscribe(mockWorker, {
                sessionId: "1000",
                pollId: 1,
                requestId: "req-1",
            })

            handleSubscribe(mockWorker, {
                sessionId: "1000",
                pollId: 1,
                requestId: "req-2",
            })

            expect(getActivePollCount()).toBe(1)
        })
    })

    describe("handleUnsubscribe", () => {
        it("should remove a poll", () => {
            const mockWorker = { id: 1, send: jest.fn() }

            handleSubscribe(mockWorker, {
                sessionId: "1000",
                pollId: 1,
                requestId: "req-1",
            })

            expect(getActivePollCount()).toBe(1)

            handleUnsubscribe({ requestId: "req-1" })

            expect(getActivePollCount()).toBe(0)
        })

        it("should not remove poll if requestId does not match", () => {
            const mockWorker = { id: 1, send: jest.fn() }

            handleSubscribe(mockWorker, {
                sessionId: "1000",
                pollId: 1,
                requestId: "req-1",
            })

            handleUnsubscribe({ requestId: "req-different" })

            expect(getActivePollCount()).toBe(1)
        })

        it("should handle unsubscribe for non-existent requestId", () => {
            expect(() => {
                handleUnsubscribe({ requestId: "non-existent" })
            }).not.toThrow()
        })
    })

    describe("handlePublish", () => {
        it("should wake opponent's poll", () => {
            // Mock cluster.workers
            const mockWorker = { id: 1, send: jest.fn() }
            const cluster = require("cluster")
            cluster.workers = { 1: mockWorker }

            handleSubscribe(mockWorker, {
                sessionId: "1001", // Player 1 (odd)
                pollId: 1,
                requestId: "req-1",
            })

            // Player 0 sends message (even session ID)
            handlePublish({ senderSessionId: "1000" })

            expect(mockWorker.send).toHaveBeenCalledWith({
                nc: true,
                type: "WAKE",
                requestId: "req-1",
            })
        })

        it("should not fail if no poll exists for opponent", () => {
            expect(() => {
                handlePublish({ senderSessionId: "1000" })
            }).not.toThrow()
        })

        it("should wake correct opponent based on session ID", () => {
            const mockWorker1 = { id: 1, send: jest.fn() }
            const mockWorker2 = { id: 2, send: jest.fn() }
            const cluster = require("cluster")
            cluster.workers = { 1: mockWorker1, 2: mockWorker2 }

            // Player 0 subscribes (even)
            handleSubscribe(mockWorker1, {
                sessionId: "2000",
                pollId: 1,
                requestId: "req-p0",
            })

            // Player 1 subscribes (odd)
            handleSubscribe(mockWorker2, {
                sessionId: "2001",
                pollId: 1,
                requestId: "req-p1",
            })

            // Player 0 sends message, should wake Player 1
            handlePublish({ senderSessionId: "2000" })

            expect(mockWorker2.send).toHaveBeenCalledWith({
                nc: true,
                type: "WAKE",
                requestId: "req-p1",
            })
            // mockWorker1.send may have been called during subscribe, but not for WAKE
            expect(mockWorker1.send).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: "WAKE" })
            )
        })
    })

    describe("clearAllPolls", () => {
        it("should clear all active polls", () => {
            const mockWorker = { id: 1, send: jest.fn() }

            handleSubscribe(mockWorker, {
                sessionId: "1000",
                pollId: 1,
                requestId: "req-1",
            })
            handleSubscribe(mockWorker, {
                sessionId: "2000",
                pollId: 1,
                requestId: "req-2",
            })

            expect(getActivePollCount()).toBe(2)

            clearAllPolls()

            expect(getActivePollCount()).toBe(0)
        })
    })
})
