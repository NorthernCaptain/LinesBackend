/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockExecute = jest.fn()
const mockGetConnection = jest.fn()
const mockConnection = {
    execute: jest.fn(),
    query: jest.fn(),
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

// Mock setupService - default to allowing all versions and no maintenance
const mockGetMinVersion = jest.fn().mockResolvedValue(0)
const mockIsMaintenanceMode = jest.fn().mockResolvedValue(false)

jest.mock("./setupService", () => ({
    getMinVersion: () => mockGetMinVersion(),
    isMaintenanceMode: () => mockIsMaintenanceMode(),
}))

const {
    connect,
    reconnect,
    generateSessionId,
    toBaseSessionId,
    getPlayer,
    serializeUser,
} = require("./connectService")

describe("services/navalclash/connectService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockGetConnection.mockResolvedValue(mockConnection)
        mockConnection.execute.mockReset()
        mockConnection.query.mockReset()
        mockConnection.beginTransaction.mockReset()
        mockConnection.commit.mockReset()
        mockConnection.rollback.mockReset()
        mockConnection.release.mockReset()
        // Reset setupService mocks to defaults
        mockGetMinVersion.mockResolvedValue(0)
        mockIsMaintenanceMode.mockResolvedValue(false)
    })

    describe("generateSessionId", () => {
        it("should generate unique session IDs", () => {
            const id1 = generateSessionId()
            const id2 = generateSessionId()

            expect(id1).not.toBe(id2)
        })

        it("should generate even numbers (player 0)", () => {
            for (let i = 0; i < 10; i++) {
                const id = generateSessionId()
                expect(id % 2n).toBe(0n)
            }
        })

        it("should generate BigInt values", () => {
            const id = generateSessionId()
            expect(typeof id).toBe("bigint")
        })

        it("should generate IDs greater than timestamp", () => {
            const before = BigInt(Date.now())
            const id = generateSessionId()
            // ID should be timestamp << 16, so much larger
            expect(id).toBeGreaterThan(before)
        })
    })

    describe("toBaseSessionId", () => {
        it("should return same value for even numbers", () => {
            expect(toBaseSessionId(100n)).toBe(100n)
            expect(toBaseSessionId(1000n)).toBe(1000n)
        })

        it("should strip last bit for odd numbers", () => {
            expect(toBaseSessionId(101n)).toBe(100n)
            expect(toBaseSessionId(1001n)).toBe(1000n)
        })

        it("should handle string input", () => {
            expect(toBaseSessionId("100")).toBe(100n)
            expect(toBaseSessionId("101")).toBe(100n)
        })
    })

    describe("getPlayer", () => {
        it("should return 0 for even numbers", () => {
            expect(getPlayer(100n)).toBe(0)
            expect(getPlayer(1000n)).toBe(0)
        })

        it("should return 1 for odd numbers", () => {
            expect(getPlayer(101n)).toBe(1)
            expect(getPlayer(1001n)).toBe(1)
        })

        it("should handle string input", () => {
            expect(getPlayer("100")).toBe(0)
            expect(getPlayer("101")).toBe(1)
        })
    })

    describe("serializeUser", () => {
        it("should serialize user object for API response", () => {
            const user = {
                id: 1,
                name: "TestPlayer",
                pin: 1234,
                face: 5,
                rank: 10,
                stars: 50,
                games: 100,
                gameswon: 60,
                coins: 500,
                extra_field: "ignored",
            }

            const result = serializeUser(user)

            expect(result).toEqual({
                id: 1,
                n: "TestPlayer",
                pin: 1234,
                f: 5,
                r: 10,
                s: 50,
                g: 100,
                w: 60,
                c: 500,
            })
        })
    })

    describe("connect", () => {
        const mockRes = {
            json: jest.fn(),
        }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should refuse invalid connect request - missing player", async () => {
            const req = { body: { type: "connect", uuuid: "uuid" } }

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "refused",
                reason: "Invalid connect request",
            })
        })

        it("should refuse invalid connect request - missing uuuid", async () => {
            const req = { body: { type: "connect", player: "Test" } }

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "refused",
                reason: "Invalid connect request",
            })
        })

        it("should refuse invalid connect request - wrong type", async () => {
            const req = {
                body: { type: "wrong", player: "Test", uuuid: "uuid" },
            }

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "refused",
                reason: "Invalid connect request",
            })
        })

        it("should return banned for banned user", async () => {
            const req = {
                body: { type: "connect", player: "Banned", uuuid: "uuid" },
            }

            mockConnection.execute
                .mockResolvedValueOnce([]) // SET TRANSACTION ISOLATION LEVEL
                .mockResolvedValueOnce([[{ id: 1, isbanned: 1 }]]) // find user
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // update login

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "banned",
                msg: {
                    type: "msg",
                    m: 9, // MSG_USER_BANNED
                    p: [],
                    c: false,
                },
                errcode: 1,
            })
            expect(mockConnection.commit).toHaveBeenCalled()
        })

        it("should return maintenance when in maintenance mode", async () => {
            const req = {
                body: { type: "connect", player: "Test", uuuid: "uuid" },
            }

            // Enable maintenance mode via mock
            mockIsMaintenanceMode.mockResolvedValueOnce(true)

            mockConnection.execute
                .mockResolvedValueOnce([]) // SET TRANSACTION ISOLATION LEVEL
                .mockResolvedValueOnce([[{ id: 1, isbanned: 0 }]]) // find user
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // update login

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "maintenance",
                reason: "Server maintenance",
            })
        })

        it("should refuse connection when client version is too old", async () => {
            const req = {
                body: { type: "connect", player: "Test", uuuid: "uuid", v: 10 },
            }

            // Set minimum version higher than client version
            mockGetMinVersion.mockResolvedValueOnce(25)

            mockConnection.execute
                .mockResolvedValueOnce([]) // SET TRANSACTION ISOLATION LEVEL
                .mockResolvedValueOnce([[{ id: 1, isbanned: 0 }]]) // find user
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // update login

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "refused",
                msg: {
                    type: "msg",
                    m: 14, // MSG_OLD_FORBIDDEN_VERSION
                    p: [],
                    c: true,
                },
                errcode: 1,
                reason: "Version too old",
            })
        })

        it("should create new session for new player", async () => {
            const req = {
                body: {
                    type: "connect",
                    player: "NewPlayer",
                    uuuid: "new-uuid",
                    var: 1,
                },
            }

            const mockUser = {
                id: 5,
                name: "NewPlayer",
                pin: 1234,
                face: 0,
                rank: 0,
                stars: 0,
                games: 0,
                gameswon: 0,
                coins: 0,
                isbanned: 0,
            }

            mockConnection.execute
                .mockResolvedValueOnce([]) // SET TRANSACTION ISOLATION LEVEL
                .mockResolvedValueOnce([[]]) // find user - not found
                .mockResolvedValueOnce([{ insertId: 5 }]) // insert user
                .mockResolvedValueOnce([[]]) // check PIN
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // update PIN
                .mockResolvedValueOnce([[mockUser]]) // fetch created user
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // terminate old sessions
                .mockResolvedValueOnce([[{ game_variant: 1 }]]) // matchmaking lock SELECT FOR UPDATE
                .mockResolvedValueOnce([[]]) // find waiting session

            // Session creation uses query() instead of execute() for BigInt
            mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }])

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "connected",
                    sid: expect.any(String),
                    u: expect.objectContaining({ n: "NewPlayer" }),
                })
            )
            expect(mockConnection.commit).toHaveBeenCalled()
            expect(mockConnection.release).toHaveBeenCalled()
        })

        it("should join existing session when waiting session found", async () => {
            const req = {
                body: {
                    type: "connect",
                    player: "Joiner",
                    uuuid: "joiner-uuid",
                    var: 1,
                },
            }

            const mockUser = {
                id: 10,
                name: "Joiner",
                pin: 5678,
                face: 1,
                rank: 5,
                stars: 10,
                games: 20,
                gameswon: 10,
                coins: 100,
                isbanned: 0,
            }

            const waitingSession = {
                id: "1000",
                user_one_id: 5,
                user_one_name: "Player1",
                status: 0,
            }

            mockConnection.execute
                .mockResolvedValueOnce([]) // SET TRANSACTION ISOLATION LEVEL
                .mockResolvedValueOnce([[mockUser]]) // find user
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // update login
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // terminate old sessions
                .mockResolvedValueOnce([[{ game_variant: 1 }]]) // matchmaking lock SELECT FOR UPDATE
                .mockResolvedValueOnce([[waitingSession]]) // find waiting session

            // Join session uses query() instead of execute() for BigInt
            mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }])

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "connected",
                    sid: "1001", // Base 1000 + 1 for player 1
                })
            )
        })

        it("should handle database errors", async () => {
            const req = {
                body: { type: "connect", player: "Error", uuuid: "error-uuid" },
            }

            mockConnection.execute.mockRejectedValueOnce(
                new Error("DB failure")
            )

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "refused",
                reason: "Server error",
            })
            expect(mockConnection.rollback).toHaveBeenCalled()
            expect(mockConnection.release).toHaveBeenCalled()
        })

        it("should handle device creation when androidId provided", async () => {
            const req = {
                body: {
                    type: "connect",
                    player: "WithDevice",
                    uuuid: "device-uuid",
                    androidId: "android-123",
                    model: "Pixel",
                    var: 1,
                },
            }

            const mockUser = {
                id: 15,
                name: "WithDevice",
                pin: 9999,
                face: 0,
                rank: 0,
                stars: 0,
                games: 0,
                gameswon: 0,
                coins: 0,
                isbanned: 0,
            }

            mockConnection.execute
                .mockResolvedValueOnce([]) // SET TRANSACTION ISOLATION LEVEL
                .mockResolvedValueOnce([[mockUser]]) // find user
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // update login
                .mockResolvedValueOnce([[]]) // find device - not found
                .mockResolvedValueOnce([{ insertId: 20 }]) // create device
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // link user_devices
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // update last_device_id
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // terminate old sessions
                .mockResolvedValueOnce([[{ game_variant: 1 }]]) // matchmaking lock SELECT FOR UPDATE
                .mockResolvedValueOnce([[]]) // find waiting session

            // Session creation uses query() instead of execute() for BigInt
            mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }])

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "connected",
                })
            )
        })
    })

    describe("reconnect", () => {
        const mockRes = {
            json: jest.fn(),
        }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should refuse when no session ID provided", async () => {
            const req = { body: {} }

            await reconnect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "refused",
                reason: "No session ID",
            })
        })

        it("should refuse when session not found", async () => {
            const req = { body: { sid: "99999" } }
            mockExecute.mockResolvedValue([[]])

            await reconnect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "refused",
                errcode: 5,
                reason: "Session not found",
            })
        })

        it("should refuse when session is finished (status >= 10)", async () => {
            const req = { body: { sid: "12345" } }
            mockExecute.mockResolvedValue([[]])

            await reconnect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "refused",
                })
            )
        })

        it("should allow reconnect for active session", async () => {
            const req = { body: { sid: "12345" } }
            mockExecute.mockResolvedValue([[{ id: "12345", status: 1 }]])

            await reconnect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "connected",
                sid: "12345",
            })
        })

        it("should allow reconnect for waiting session", async () => {
            const req = { body: { sid: "54321" } }
            mockExecute.mockResolvedValue([[{ id: "54321", status: 0 }]])

            await reconnect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "connected",
                sid: "54321",
            })
        })
    })
})
