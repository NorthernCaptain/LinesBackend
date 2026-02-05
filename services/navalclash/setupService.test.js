/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockExecute = jest.fn()

jest.mock("../../db/navalclash", () => ({
    pool: {
        execute: mockExecute,
    },
}))

// Must require after mocking
const {
    getConfig,
    getMinVersion,
    isMaintenanceMode,
    invalidateConfig,
    invalidateAllConfigs,
    getCacheStats,
} = require("./setupService")

const { TIMING } = require("./constants")

describe("services/navalclash/setupService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
        // Clear cache between tests
        invalidateAllConfigs()
    })

    describe("getConfig", () => {
        it("should fetch config from database on first call", async () => {
            mockExecute.mockResolvedValueOnce([
                [{ name: "test_config", int_value: 42, str_value: null }],
            ])

            const result = await getConfig("test_config")

            expect(mockExecute).toHaveBeenCalledWith(
                "SELECT * FROM gamesetup WHERE name = ?",
                ["test_config"]
            )
            expect(result).toEqual({
                name: "test_config",
                int_value: 42,
                str_value: null,
            })
        })

        it("should return cached value on subsequent calls", async () => {
            mockExecute.mockResolvedValueOnce([
                [{ name: "cached_config", int_value: 100 }],
            ])

            // First call - fetches from DB
            await getConfig("cached_config")
            expect(mockExecute).toHaveBeenCalledTimes(1)

            // Second call - should use cache
            const result = await getConfig("cached_config")
            expect(mockExecute).toHaveBeenCalledTimes(1) // Still 1
            expect(result.int_value).toBe(100)
        })

        it("should return null for non-existent config", async () => {
            mockExecute.mockResolvedValueOnce([[]])

            const result = await getConfig("nonexistent")

            expect(result).toBeNull()
        })

        it("should cache null values to prevent repeated queries", async () => {
            mockExecute.mockResolvedValueOnce([[]])

            await getConfig("missing_config")
            await getConfig("missing_config")

            // Should only query once, even for null results
            expect(mockExecute).toHaveBeenCalledTimes(1)
        })

        it("should handle database errors gracefully", async () => {
            mockExecute.mockRejectedValueOnce(new Error("DB Error"))

            const result = await getConfig("error_config")

            expect(result).toBeNull()
        })
    })

    describe("getMinVersion", () => {
        it("should return min_version int_value", async () => {
            mockExecute.mockResolvedValueOnce([
                [{ name: "min_version", int_value: 25 }],
            ])

            const result = await getMinVersion()

            expect(result).toBe(25)
        })

        it("should return 0 if min_version not configured", async () => {
            mockExecute.mockResolvedValueOnce([[]])

            const result = await getMinVersion()

            expect(result).toBe(0)
        })

        it("should return 0 if int_value is null", async () => {
            mockExecute.mockResolvedValueOnce([
                [{ name: "min_version", int_value: null }],
            ])

            const result = await getMinVersion()

            expect(result).toBe(0)
        })
    })

    describe("isMaintenanceMode", () => {
        it("should return true when maintenance_mode is 1", async () => {
            mockExecute.mockResolvedValueOnce([
                [{ name: "maintenance_mode", int_value: 1 }],
            ])

            const result = await isMaintenanceMode()

            expect(result).toBe(true)
        })

        it("should return false when maintenance_mode is 0", async () => {
            mockExecute.mockResolvedValueOnce([
                [{ name: "maintenance_mode", int_value: 0 }],
            ])

            const result = await isMaintenanceMode()

            expect(result).toBe(false)
        })

        it("should return false when maintenance_mode not configured", async () => {
            mockExecute.mockResolvedValueOnce([[]])

            const result = await isMaintenanceMode()

            expect(result).toBe(false)
        })
    })

    describe("invalidateConfig", () => {
        it("should clear specific config from cache", async () => {
            mockExecute.mockResolvedValue([
                [{ name: "test", int_value: 1 }],
            ])

            // Populate cache
            await getConfig("test")
            expect(mockExecute).toHaveBeenCalledTimes(1)

            // Invalidate and fetch again
            invalidateConfig("test")
            await getConfig("test")

            // Should query DB again
            expect(mockExecute).toHaveBeenCalledTimes(2)
        })
    })

    describe("invalidateAllConfigs", () => {
        it("should clear all configs from cache", async () => {
            mockExecute.mockResolvedValue([[{ int_value: 1 }]])

            // Populate cache with multiple configs
            await getConfig("config1")
            await getConfig("config2")
            expect(mockExecute).toHaveBeenCalledTimes(2)

            // Invalidate all
            invalidateAllConfigs()

            // Fetch again - should query DB
            await getConfig("config1")
            await getConfig("config2")
            expect(mockExecute).toHaveBeenCalledTimes(4)
        })
    })

    describe("getCacheStats", () => {
        it("should return cache statistics", async () => {
            mockExecute.mockResolvedValue([[{ int_value: 1 }]])

            await getConfig("stat_test")

            const stats = getCacheStats()

            expect(stats.size).toBe(1)
            expect(stats.entries).toHaveLength(1)
            expect(stats.entries[0].name).toBe("stat_test")
            expect(stats.entries[0].hasValue).toBe(true)
            expect(stats.entries[0].expiresIn).toBeGreaterThan(0)
        })

        it("should return empty stats when cache is empty", () => {
            const stats = getCacheStats()

            expect(stats.size).toBe(0)
            expect(stats.entries).toHaveLength(0)
        })
    })

    describe("TIMING.CACHE_TTL_MS", () => {
        it("should be 1 hour in milliseconds", () => {
            expect(TIMING.CACHE_TTL_MS).toBe(60 * 60 * 1000)
        })
    })
})
