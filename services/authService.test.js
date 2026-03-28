/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockDbFunctions = {
    dbHasUser: jest.fn(),
    dbCreateUser: jest.fn(),
    dbGetUser: jest.fn(),
    dbCreateAccessToken: jest.fn(),
    dbGetAccessToken: jest.fn(),
    dbDeleteAccessToken: jest.fn(),
    dbGetClientToken: jest.fn(),
    dbCreateRefreshToken: jest.fn(),
    dbGetRefreshToken: jest.fn(),
    dbDeleteRefreshToken: jest.fn(),
    hashToken: jest.fn((t) => `hashed_${t}`),
}

jest.mock("../db/auth", () => mockDbFunctions)
jest.mock("../utils/validate.js", () => ({
    validate: jest.fn(),
}))
jest.mock("../utils/respond.js", () => ({
    respond: jest.fn(),
}))

const { model, logoutUser, registerUser } = require("./authService")

beforeEach(() => {
    jest.clearAllMocks()
})

describe("model.getClient", () => {
    it("returns client object when credentials are valid", (done) => {
        mockDbFunctions.dbGetClientToken.mockResolvedValue({
            client: "app",
        })

        model.getClient("app", "secret", (err, client) => {
            expect(err).toBe(false)
            expect(client).toEqual({
                clientID: "app",
                clientSecret: "secret",
                grants: ["password", "refresh_token"],
                redirectUris: null,
            })
            done()
        })
    })

    it("returns null when credentials are invalid", (done) => {
        mockDbFunctions.dbGetClientToken.mockResolvedValue(null)

        model.getClient("bad", "bad", (err, client) => {
            expect(err).toBe(false)
            expect(client).toBeNull()
            done()
        })
    })
})

describe("model.grantTypeAllowed", () => {
    it("allows all grant types", (done) => {
        model.grantTypeAllowed("app", "password", (err, allowed) => {
            expect(allowed).toBe(true)
            done()
        })
    })
})

describe("model.getUser", () => {
    it("returns user on valid credentials", (done) => {
        const user = { user_id: 1, email: "a@b.com" }
        mockDbFunctions.dbGetUser.mockResolvedValue(user)

        model.getUser("a@b.com", "pass", (err, result) => {
            expect(err).toBe(false)
            expect(result).toEqual(user)
            done()
        })
    })

    it("returns null on invalid credentials", (done) => {
        mockDbFunctions.dbGetUser.mockResolvedValue(null)

        model.getUser("a@b.com", "wrong", (err, result) => {
            expect(err).toBe(false)
            expect(result).toBeNull()
            done()
        })
    })
})

describe("model.saveAccessToken", () => {
    it("delegates to dbCreateAccessToken", (done) => {
        mockDbFunctions.dbCreateAccessToken.mockResolvedValue(1)
        const expires = new Date()
        const user = { user_id: 5 }

        model.saveAccessToken("token", "client1", expires, user, (err, id) => {
            expect(err).toBe(false)
            expect(id).toBe(1)
            expect(mockDbFunctions.dbCreateAccessToken).toHaveBeenCalledWith(
                "token",
                { user_id: 5 },
                expires
            )
            done()
        })
    })

    it("falls back to user.id when user_id is absent (refresh grant)", (done) => {
        mockDbFunctions.dbCreateAccessToken.mockResolvedValue(1)
        const expires = new Date()
        const user = { id: 9 }

        model.saveAccessToken("token", "client1", expires, user, (err, id) => {
            expect(err).toBe(false)
            expect(mockDbFunctions.dbCreateAccessToken).toHaveBeenCalledWith(
                "token",
                { user_id: 9 },
                expires
            )
            done()
        })
    })
})

describe("model.getAccessToken", () => {
    it("returns user and expires from token record", (done) => {
        const expiresAt = new Date()
        mockDbFunctions.dbGetAccessToken.mockResolvedValue({
            user_id: 3,
            expires_at: expiresAt,
        })

        model.getAccessToken("bearer-token", (err, result) => {
            expect(err).toBe(false)
            expect(result).toEqual({
                user: { user_id: 3 },
                expires: expiresAt,
            })
            done()
        })
    })

    it("returns null when token not found", (done) => {
        mockDbFunctions.dbGetAccessToken.mockResolvedValue(null)

        model.getAccessToken("bad-token", (err, result) => {
            expect(err).toBe(false)
            expect(result).toBeNull()
            done()
        })
    })
})

describe("model.saveRefreshToken", () => {
    it("delegates to dbCreateRefreshToken with user_id", (done) => {
        mockDbFunctions.dbCreateRefreshToken.mockResolvedValue(true)
        const expires = new Date()
        const user = { user_id: 7 }

        model.saveRefreshToken(
            "refresh-tok",
            "client1",
            expires,
            user,
            (err, result) => {
                expect(err).toBe(false)
                expect(result).toBe(true)
                expect(
                    mockDbFunctions.dbCreateRefreshToken
                ).toHaveBeenCalledWith("refresh-tok", "client1", 7, expires)
                done()
            }
        )
    })

    it("falls back to user.id when user_id is absent (refresh grant)", (done) => {
        mockDbFunctions.dbCreateRefreshToken.mockResolvedValue(true)
        const expires = new Date()
        const user = { id: 3 }

        model.saveRefreshToken(
            "refresh-tok",
            "client1",
            expires,
            user,
            (err, result) => {
                expect(err).toBe(false)
                expect(
                    mockDbFunctions.dbCreateRefreshToken
                ).toHaveBeenCalledWith("refresh-tok", "client1", 3, expires)
                done()
            }
        )
    })
})

describe("model.getRefreshToken", () => {
    it("returns mapped token data", (done) => {
        const expiresAt = new Date()
        mockDbFunctions.dbGetRefreshToken.mockResolvedValue({
            client_id: "c1",
            user_id: 2,
            expires_at: expiresAt,
        })

        model.getRefreshToken("refresh-tok", (err, result) => {
            expect(err).toBe(false)
            expect(result).toEqual({
                clientId: "c1",
                userId: 2,
                expires: expiresAt,
            })
            done()
        })
    })

    it("returns null when not found", (done) => {
        mockDbFunctions.dbGetRefreshToken.mockResolvedValue(null)

        model.getRefreshToken("bad", (err, result) => {
            expect(err).toBe(false)
            expect(result).toBeNull()
            done()
        })
    })
})

describe("model.revokeRefreshToken", () => {
    it("delegates to dbDeleteRefreshToken", (done) => {
        mockDbFunctions.dbDeleteRefreshToken.mockResolvedValue(true)

        model.revokeRefreshToken("refresh-tok", (err, result) => {
            expect(err).toBe(false)
            expect(result).toBe(true)
            expect(mockDbFunctions.dbDeleteRefreshToken).toHaveBeenCalledWith(
                "refresh-tok"
            )
            done()
        })
    })
})

describe("logoutUser", () => {
    it("deletes the bearer token and returns success", async () => {
        mockDbFunctions.dbDeleteAccessToken.mockResolvedValue(true)
        const req = {
            get: jest.fn().mockReturnValue("Bearer abc123def456"),
        }
        const res = { json: jest.fn() }

        await logoutUser(req, res)

        expect(mockDbFunctions.dbDeleteAccessToken).toHaveBeenCalledWith(
            "abc123def456"
        )
        expect(res.json).toHaveBeenCalledWith({ success: true })
    })

    it("throws when no Authorization header", async () => {
        const req = { get: jest.fn().mockReturnValue(null) }
        const res = { json: jest.fn() }

        await expect(logoutUser(req, res)).rejects.toThrow()
    })
})

describe("registerUser", () => {
    it("creates a new user when email is available", async () => {
        mockDbFunctions.dbHasUser.mockResolvedValue(false)
        mockDbFunctions.dbCreateUser.mockResolvedValue(99)
        const { respond } = require("../utils/respond.js")
        const req = {
            body: { email: "new@test.com", password: "pass1234", name: "New" },
        }
        const res = {}

        await registerUser(req, res)

        expect(mockDbFunctions.dbCreateUser).toHaveBeenCalledWith(
            "new@test.com",
            "pass1234",
            "New"
        )
        expect(respond).toHaveBeenCalledWith(
            { user_id: 99 },
            "register_user_resp",
            res
        )
    })

    it("throws when email already exists", async () => {
        mockDbFunctions.dbHasUser.mockResolvedValue(true)
        const req = {
            body: { email: "dup@test.com", password: "pass1234" },
        }
        const res = {}

        await expect(registerUser(req, res)).rejects.toThrow("111")
    })
})
