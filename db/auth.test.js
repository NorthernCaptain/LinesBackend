/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */
const crypto = require("crypto")

const mockQuery = jest.fn()
jest.mock("./db", () => ({
    authdb: { query: mockQuery },
}))

const bcrypt = require("bcrypt")
const {
    dbCreateUser,
    dbGetUser,
    dbHasUser,
    dbCreateAccessToken,
    dbGetAccessToken,
    dbDeleteAccessToken,
    dbGetClientToken,
    dbCreateRefreshToken,
    dbGetRefreshToken,
    dbDeleteRefreshToken,
    hashToken,
} = require("./auth")

beforeEach(() => {
    mockQuery.mockReset()
})

describe("hashToken", () => {
    it("returns a SHA256 hex digest", () => {
        const hash = hashToken("test-token")
        expect(hash).toHaveLength(64)
        expect(hash).toMatch(/^[a-f0-9]+$/)
    })

    it("produces consistent hashes", () => {
        expect(hashToken("abc")).toBe(hashToken("abc"))
    })

    it("produces different hashes for different inputs", () => {
        expect(hashToken("abc")).not.toBe(hashToken("def"))
    })
})

describe("dbCreateUser", () => {
    it("stores a bcrypt-hashed password", async () => {
        mockQuery.mockResolvedValue([{ insertId: 42 }])

        const result = await dbCreateUser("a@b.com", "mypassword", "Alice")

        expect(result).toBe(42)
        const [, params] = mockQuery.mock.calls[0]
        expect(params[0]).toBe("a@b.com")
        expect(params[1]).toMatch(/^\$2[ab]\$12\$/)
        expect(params[2]).toBe("Alice")
    })

    it("returns null on DB error", async () => {
        mockQuery.mockRejectedValue(new Error("DB error"))
        const result = await dbCreateUser("a@b.com", "pass", "name")
        expect(result).toBeNull()
    })
})

describe("dbGetUser", () => {
    it("authenticates against a bcrypt hash", async () => {
        const bcryptHash = await bcrypt.hash("secret123", 12)
        mockQuery.mockResolvedValue([
            [{ user_id: 1, email: "a@b.com", password: bcryptHash }],
        ])

        const user = await dbGetUser("a@b.com", "secret123")

        expect(user).toEqual({
            user_id: 1,
            email: "a@b.com",
            password: bcryptHash,
        })
    })

    it("rejects wrong password for bcrypt hash", async () => {
        const bcryptHash = await bcrypt.hash("secret123", 12)
        mockQuery.mockResolvedValue([
            [{ user_id: 1, email: "a@b.com", password: bcryptHash }],
        ])

        const user = await dbGetUser("a@b.com", "wrong")
        expect(user).toBeNull()
    })

    it("authenticates against a legacy SHA256 hash and migrates it", async () => {
        const sha256Hash = crypto
            .createHash("sha256")
            .update("oldpass")
            .digest("hex")
        mockQuery
            .mockResolvedValueOnce([
                [{ user_id: 5, email: "old@b.com", password: sha256Hash }],
            ])
            .mockResolvedValueOnce([{ affectedRows: 1 }])

        const user = await dbGetUser("old@b.com", "oldpass")

        expect(user).toBeTruthy()
        expect(user.user_id).toBe(5)
        // Second call should be the password migration UPDATE
        expect(mockQuery).toHaveBeenCalledTimes(2)
        const [updateSql, updateParams] = mockQuery.mock.calls[1]
        expect(updateSql).toMatch(/update users set password/)
        expect(updateParams[0]).toMatch(/^\$2[ab]\$12\$/)
        expect(updateParams[1]).toBe(5)
    })

    it("rejects wrong password for legacy SHA256 hash", async () => {
        const sha256Hash = crypto
            .createHash("sha256")
            .update("oldpass")
            .digest("hex")
        mockQuery.mockResolvedValue([
            [{ user_id: 5, email: "old@b.com", password: sha256Hash }],
        ])

        const user = await dbGetUser("old@b.com", "wrongpass")
        expect(user).toBeNull()
        // No migration should happen
        expect(mockQuery).toHaveBeenCalledTimes(1)
    })

    it("returns null when user not found", async () => {
        mockQuery.mockResolvedValue([[]])
        const user = await dbGetUser("no@exist.com", "pass")
        expect(user).toBeNull()
    })

    it("returns null on DB error", async () => {
        mockQuery.mockRejectedValue(new Error("DB error"))
        const user = await dbGetUser("a@b.com", "pass")
        expect(user).toBeNull()
    })
})

describe("dbHasUser", () => {
    it("returns true when user exists", async () => {
        mockQuery.mockResolvedValue([[{ user_id: 1 }]])
        expect(await dbHasUser("a@b.com")).toBe(true)
    })

    it("returns false when user does not exist", async () => {
        mockQuery.mockResolvedValue([[]])
        expect(await dbHasUser("no@exist.com")).toBe(false)
    })
})

describe("dbCreateAccessToken", () => {
    it("stores a hashed token, not the raw token", async () => {
        mockQuery.mockResolvedValue([{ insertId: 10 }])
        const expires = new Date()

        const result = await dbCreateAccessToken(
            "raw-token-abc",
            { user_id: 1 },
            expires
        )

        expect(result).toBe(10)
        const [, params] = mockQuery.mock.calls[0]
        expect(params[0]).toBe(hashToken("raw-token-abc"))
        expect(params[0]).not.toBe("raw-token-abc")
        expect(params[1]).toBe(1)
        expect(params[2]).toBe(expires)
    })
})

describe("dbGetAccessToken", () => {
    it("looks up by hashed token", async () => {
        const tokenHash = hashToken("my-token")
        mockQuery.mockResolvedValue([
            [{ token: tokenHash, user_id: 1, expires_at: new Date() }],
        ])

        const result = await dbGetAccessToken("my-token")

        expect(result).toBeTruthy()
        const [, params] = mockQuery.mock.calls[0]
        expect(params[0]).toBe(tokenHash)
    })

    it("returns null when token not found", async () => {
        mockQuery.mockResolvedValue([[]])
        const result = await dbGetAccessToken("nonexistent")
        expect(result).toBeNull()
    })
})

describe("dbDeleteAccessToken", () => {
    it("deletes by hashed token", async () => {
        mockQuery.mockResolvedValue([{ affectedRows: 1 }])

        const result = await dbDeleteAccessToken("my-token")

        expect(result).toBe(true)
        const [, params] = mockQuery.mock.calls[0]
        expect(params[0]).toBe(hashToken("my-token"))
    })
})

describe("dbGetClientToken", () => {
    it("returns client record when valid", async () => {
        const client = { client: "app", client_secret: "sec", is_valid: 1 }
        mockQuery.mockResolvedValue([[client]])

        const result = await dbGetClientToken("app", "sec")
        expect(result).toEqual(client)
    })

    it("returns null when client not found", async () => {
        mockQuery.mockResolvedValue([[]])
        const result = await dbGetClientToken("bad", "bad")
        expect(result).toBeNull()
    })
})

describe("dbCreateRefreshToken", () => {
    it("stores a hashed refresh token", async () => {
        mockQuery.mockResolvedValue([{ insertId: 1 }])
        const expires = new Date()

        const result = await dbCreateRefreshToken(
            "refresh-abc",
            "client1",
            42,
            expires
        )

        expect(result).toBe(true)
        const [, params] = mockQuery.mock.calls[0]
        expect(params[0]).toBe(hashToken("refresh-abc"))
        expect(params[1]).toBe("client1")
        expect(params[2]).toBe(42)
        expect(params[3]).toBe(expires)
    })
})

describe("dbGetRefreshToken", () => {
    it("looks up by hashed token", async () => {
        const record = {
            token: hashToken("refresh-abc"),
            client_id: "c1",
            user_id: 1,
            expires_at: new Date(),
        }
        mockQuery.mockResolvedValue([[record]])

        const result = await dbGetRefreshToken("refresh-abc")

        expect(result).toEqual(record)
        const [, params] = mockQuery.mock.calls[0]
        expect(params[0]).toBe(hashToken("refresh-abc"))
    })

    it("returns null when not found", async () => {
        mockQuery.mockResolvedValue([[]])
        expect(await dbGetRefreshToken("nope")).toBeNull()
    })
})

describe("dbDeleteRefreshToken", () => {
    it("deletes by hashed token", async () => {
        mockQuery.mockResolvedValue([{ affectedRows: 1 }])

        const result = await dbDeleteRefreshToken("refresh-abc")

        expect(result).toBe(true)
        const [, params] = mockQuery.mock.calls[0]
        expect(params[0]).toBe(hashToken("refresh-abc"))
    })
})
