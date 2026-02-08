/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockExecute = jest.fn()

jest.mock("./pool", () => ({
    pool: { execute: mockExecute },
}))

const {
    DeviceKeyCache,
    dbGetDeviceKey,
    dbStoreDeviceKey,
    dbCleanupExpiredKeys,
} = require("./keys")

describe("DeviceKeyCache", () => {
    let cache

    beforeEach(() => {
        cache = new DeviceKeyCache(3)
    })

    it("should return null for missing key", () => {
        expect(cache.get("missing")).toBeNull()
    })

    it("should store and retrieve a key", () => {
        const key = Buffer.from("test-key")
        cache.set("token1", key, "device-uuid-1")

        const result = cache.get("token1")
        expect(result.key).toEqual(key)
        expect(result.deviceUuid).toBe("device-uuid-1")
    })

    it("should evict LRU entry when at capacity", () => {
        cache.set("a", Buffer.from("ka"), "da")
        cache.set("b", Buffer.from("kb"), "db")
        cache.set("c", Buffer.from("kc"), "dc")

        // Cache is full (3), adding d should evict a (LRU)
        cache.set("d", Buffer.from("kd"), "dd")

        expect(cache.get("a")).toBeNull()
        expect(cache.get("b")).not.toBeNull()
        expect(cache.get("d")).not.toBeNull()
    })

    it("should promote accessed entry to MRU", () => {
        cache.set("a", Buffer.from("ka"), "da")
        cache.set("b", Buffer.from("kb"), "db")
        cache.set("c", Buffer.from("kc"), "dc")

        // Access a (promotes to MRU)
        cache.get("a")

        // Add d - should evict b (now LRU), not a
        cache.set("d", Buffer.from("kd"), "dd")

        expect(cache.get("a")).not.toBeNull()
        expect(cache.get("b")).toBeNull()
    })

    it("should update existing entry", () => {
        const key1 = Buffer.from("key1")
        const key2 = Buffer.from("key2")

        cache.set("token1", key1, "uuid1")
        cache.set("token1", key2, "uuid2")

        const result = cache.get("token1")
        expect(result.key).toEqual(key2)
        expect(result.deviceUuid).toBe("uuid2")
        expect(cache.size).toBe(1)
    })

    it("should delete a key", () => {
        cache.set("token1", Buffer.from("key"), "uuid")
        cache.delete("token1")
        expect(cache.get("token1")).toBeNull()
    })

    it("should clear all entries", () => {
        cache.set("a", Buffer.from("ka"), "da")
        cache.set("b", Buffer.from("kb"), "db")
        cache.clear()
        expect(cache.size).toBe(0)
    })
})

describe("dbGetDeviceKey", () => {
    beforeEach(() => {
        mockExecute.mockReset()
    })

    it("should return key from database", async () => {
        const mockKey = Buffer.from("a".repeat(32))
        mockExecute.mockResolvedValue([
            [{ device_key: mockKey, device_uuid: "test-uuid" }],
        ])

        const result = await dbGetDeviceKey("token-base64")

        expect(result).toEqual({ key: mockKey, deviceUuid: "test-uuid" })
        expect(mockExecute).toHaveBeenCalledWith(
            expect.stringContaining("SELECT device_key"),
            ["token-base64"]
        )
    })

    it("should return null when token not found", async () => {
        mockExecute.mockResolvedValue([[]])

        const result = await dbGetDeviceKey("missing-token")
        expect(result).toBeNull()
    })

    it("should return null on database error", async () => {
        mockExecute.mockRejectedValue(new Error("DB connection failed"))

        const result = await dbGetDeviceKey("error-token")
        expect(result).toBeNull()
    })

    it("should use cache on second access", async () => {
        const mockKey = Buffer.from("b".repeat(32))
        mockExecute.mockResolvedValue([
            [{ device_key: mockKey, device_uuid: "cached-uuid" }],
        ])

        // First call hits DB
        await dbGetDeviceKey("cached-token")
        expect(mockExecute).toHaveBeenCalledTimes(1)

        // Second call should use cache
        mockExecute.mockReset()
        const result = await dbGetDeviceKey("cached-token")
        expect(result).toEqual({ key: mockKey, deviceUuid: "cached-uuid" })
        expect(mockExecute).not.toHaveBeenCalled()
    })
})

describe("dbStoreDeviceKey", () => {
    beforeEach(() => {
        mockExecute.mockReset()
    })

    it("should store key in database", async () => {
        mockExecute.mockResolvedValue([{ affectedRows: 1 }])

        const key = Buffer.from("c".repeat(32))
        const result = await dbStoreDeviceKey("token-b64", key, "uuid", 3600)

        expect(result).toBe(true)
        expect(mockExecute).toHaveBeenCalledWith(
            expect.stringContaining("INSERT INTO device_keys"),
            ["token-b64", key, "uuid", 3600]
        )
    })

    it("should return false on database error", async () => {
        mockExecute.mockRejectedValue(new Error("DB error"))

        const key = Buffer.from("d".repeat(32))
        const result = await dbStoreDeviceKey("token", key, "uuid", 3600)

        expect(result).toBe(false)
    })
})

describe("dbCleanupExpiredKeys", () => {
    beforeEach(() => {
        mockExecute.mockReset()
    })

    it("should delete expired keys and return count", async () => {
        mockExecute.mockResolvedValue([{ affectedRows: 5 }])

        const count = await dbCleanupExpiredKeys()
        expect(count).toBe(5)
        expect(mockExecute).toHaveBeenCalledWith(
            expect.stringContaining("DELETE FROM device_keys")
        )
    })

    it("should return 0 on error", async () => {
        mockExecute.mockRejectedValue(new Error("DB error"))

        const count = await dbCleanupExpiredKeys()
        expect(count).toBe(0)
    })
})
