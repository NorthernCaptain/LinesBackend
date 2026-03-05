/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockPurgeStaleSessions = jest.fn()
const mockDbCleanupExpiredKeys = jest.fn()

jest.mock("./sessionPurge", () => ({
    purgeStaleSessions: mockPurgeStaleSessions,
}))

jest.mock("../../db/navalclash/keys", () => ({
    dbCleanupExpiredKeys: mockDbCleanupExpiredKeys,
}))

jest.mock("./constants", () => ({
    TIMING: {
        SESSION_PURGE_INTERVAL_MS: 60000,
        SESSION_PURGE_MS: 120000,
    },
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
    DEVICE_KEY_PURGE_INTERVAL_MS,
    startPurgeScheduler,
    stopPurgeScheduler,
    schedule,
    sessionPurgeTick,
    deviceKeyPurgeTick,
} = require("./purgeScheduler")

describe("purgeScheduler", () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        stopPurgeScheduler()
    })

    it("should have 15 minute device key purge interval", () => {
        expect(DEVICE_KEY_PURGE_INTERVAL_MS).toBe(15 * 60 * 1000)
    })

    describe("startPurgeScheduler / stopPurgeScheduler", () => {
        it("should start without throwing", () => {
            expect(() => startPurgeScheduler()).not.toThrow()
        })

        it("should stop without throwing", () => {
            startPurgeScheduler()
            expect(() => stopPurgeScheduler()).not.toThrow()
        })

        it("should be safe to stop when not started", () => {
            expect(() => stopPurgeScheduler()).not.toThrow()
        })
    })

    describe("sessionPurgeTick", () => {
        it("should call purgeStaleSessions with threshold", async () => {
            mockPurgeStaleSessions.mockResolvedValue(0)

            await sessionPurgeTick()

            expect(mockPurgeStaleSessions).toHaveBeenCalledWith(120)
        })

        it("should log when sessions are closed", async () => {
            mockPurgeStaleSessions.mockResolvedValue(3)
            const { logger } = require("../../utils/logger")

            await sessionPurgeTick()

            expect(logger.info).toHaveBeenCalledWith(
                {},
                expect.stringContaining("3 stale session(s)")
            )
        })
    })

    describe("deviceKeyPurgeTick", () => {
        it("should call dbCleanupExpiredKeys", async () => {
            mockDbCleanupExpiredKeys.mockResolvedValue(0)

            await deviceKeyPurgeTick()

            expect(mockDbCleanupExpiredKeys).toHaveBeenCalled()
        })

        it("should log when keys are deleted", async () => {
            mockDbCleanupExpiredKeys.mockResolvedValue(5)
            const { logger } = require("../../utils/logger")

            await deviceKeyPurgeTick()

            expect(logger.info).toHaveBeenCalledWith(
                {},
                expect.stringContaining("5 expired key(s)")
            )
        })
    })

    describe("schedule (mutual exclusion)", () => {
        it("should run job immediately when idle", async () => {
            const fn = jest.fn().mockResolvedValue()

            schedule("test-job", fn)

            // Let the async run() complete
            await new Promise((r) => setImmediate(r))

            expect(fn).toHaveBeenCalledTimes(1)
        })

        it("should defer second job while first is running", async () => {
            let resolveFirst
            const firstPromise = new Promise((r) => {
                resolveFirst = r
            })
            const firstFn = jest.fn().mockReturnValue(firstPromise)
            const secondFn = jest.fn().mockResolvedValue()

            // Start first job (blocks)
            schedule("first", firstFn)
            await new Promise((r) => setImmediate(r))

            // Schedule second job while first is running
            schedule("second", secondFn)
            await new Promise((r) => setImmediate(r))

            // Second should not have run yet
            expect(firstFn).toHaveBeenCalledTimes(1)
            expect(secondFn).not.toHaveBeenCalled()

            // Complete first job
            resolveFirst()
            await new Promise((r) => setImmediate(r))

            // Now second should have run
            expect(secondFn).toHaveBeenCalledTimes(1)
        })

        it("should not queue duplicate jobs", async () => {
            let resolveFirst
            const firstPromise = new Promise((r) => {
                resolveFirst = r
            })
            const firstFn = jest.fn().mockReturnValue(firstPromise)
            const secondFn = jest.fn().mockResolvedValue()

            schedule("first", firstFn)
            await new Promise((r) => setImmediate(r))

            // Schedule same job name twice
            schedule("second", secondFn)
            schedule("second", secondFn)
            await new Promise((r) => setImmediate(r))

            resolveFirst()
            await new Promise((r) => setImmediate(r))

            // Should only run once despite being scheduled twice
            expect(secondFn).toHaveBeenCalledTimes(1)
        })
    })
})
