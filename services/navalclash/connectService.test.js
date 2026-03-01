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

        it("should create new session with last_seen_one", async () => {
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
                .mockResolvedValueOnce([[{ game_variant: 1 }]]) // matchmaking lock
                .mockResolvedValueOnce([[]]) // personal session targeting me - none
                .mockResolvedValueOnce([[]]) // random waiting session - none

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
            // Verify session INSERT includes last_seen_one
            const insertCall = mockConnection.query.mock.calls[0]
            expect(insertCall[0]).toContain("last_seen_one")
            expect(mockConnection.commit).toHaveBeenCalled()
            expect(mockConnection.release).toHaveBeenCalled()
        })

        it("should join existing session with last_seen_two", async () => {
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
                target_rival_id: null,
            }

            mockConnection.execute
                .mockResolvedValueOnce([]) // SET TRANSACTION ISOLATION LEVEL
                .mockResolvedValueOnce([[mockUser]]) // find user
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // update login
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // terminate old sessions
                .mockResolvedValueOnce([[{ game_variant: 1 }]]) // matchmaking lock
                .mockResolvedValueOnce([[]]) // personal session targeting me - none
                .mockResolvedValueOnce([[waitingSession]]) // random waiting session - found

            // Join session uses query() instead of execute() for BigInt
            mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }])

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "connected",
                    sid: "1001", // Base 1000 + 1 for player 1
                })
            )
            // Verify session UPDATE includes last_seen_two
            const updateCall = mockConnection.query.mock.calls[0]
            expect(updateCall[0]).toContain("last_seen_two")
        })

        it("should use last_seen_one for matchmaking staleness check", async () => {
            const req = {
                body: {
                    type: "connect",
                    player: "TestPlayer",
                    uuuid: "test-uuid",
                    var: 1,
                },
            }

            const mockUser = {
                id: 10,
                name: "TestPlayer",
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
                .mockResolvedValueOnce([[mockUser]]) // find user
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // update login
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // terminate
                .mockResolvedValueOnce([[{ game_variant: 1 }]]) // lock
                .mockResolvedValueOnce([[]]) // personal targeting me - none
                .mockResolvedValueOnce([[]]) // random waiting - none

            mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }])

            await connect(req, mockRes)

            // Find the random matchmaking query (should use last_seen_one)
            const matchmakingCall = mockConnection.execute.mock.calls.find(
                (call) =>
                    call[0] &&
                    call[0].includes("status = 0") &&
                    call[0].includes("user_two_id IS NULL") &&
                    call[0].includes("target_rival_id IS NULL")
            )
            expect(matchmakingCall).toBeTruthy()
            expect(matchmakingCall[0]).toContain("last_seen_one")
            expect(matchmakingCall[0]).toContain("INTERVAL 45 SECOND")
            expect(matchmakingCall[0]).not.toContain(
                "updated_at > DATE_SUB"
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
                .mockResolvedValueOnce([[{ game_variant: 1 }]]) // matchmaking lock
                .mockResolvedValueOnce([[]]) // personal session targeting me - none
                .mockResolvedValueOnce([[]]) // random waiting session - none

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

    describe("personal game matchmaking (rematch)", () => {
        const mockRes = {
            json: jest.fn(),
        }

        const mockUser = {
            id: 10,
            name: "Player",
            pin: 1234,
            face: 0,
            rank: 5,
            stars: 10,
            games: 20,
            gameswon: 10,
            coins: 100,
            isbanned: 0,
        }

        /** Sets up standard execute mocks for an existing user connecting. */
        function setupUserMocks() {
            mockConnection.execute
                .mockResolvedValueOnce([]) // SET TRANSACTION ISOLATION LEVEL
                .mockResolvedValueOnce([[mockUser]]) // find user
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // update login
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // terminate old sessions
                .mockResolvedValueOnce([[{ game_variant: 1 }]]) // matchmaking lock
        }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should join rival's personal session (mutual rematch)", async () => {
            const req = {
                body: {
                    type: "connect",
                    player: "Player",
                    uuuid: "player-uuid",
                    var: 1,
                    rival: { i: 42 },
                },
            }

            const rivalSession = {
                id: "2000",
                user_one_id: 42,
                user_one_name: "Rival",
                status: 0,
                target_rival_id: 10, // rival is targeting us
            }

            setupUserMocks()
            mockConnection.execute.mockResolvedValueOnce([
                [rivalSession],
            ]) // find rival's session

            mockConnection.query.mockResolvedValueOnce([
                { affectedRows: 1 },
            ])

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "connected",
                    sid: "2001", // joined as player 1
                })
            )
        })

        it("should join rival's random session (personal targets random)", async () => {
            const req = {
                body: {
                    type: "connect",
                    player: "Player",
                    uuuid: "player-uuid",
                    var: 1,
                    rival: { i: 42 },
                },
            }

            const rivalRandomSession = {
                id: "3000",
                user_one_id: 42,
                user_one_name: "Rival",
                status: 0,
                target_rival_id: null, // rival is waiting for anyone
            }

            setupUserMocks()
            mockConnection.execute.mockResolvedValueOnce([
                [rivalRandomSession],
            ]) // find rival's session

            mockConnection.query.mockResolvedValueOnce([
                { affectedRows: 1 },
            ])

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "connected",
                    sid: "3001",
                })
            )
        })

        it("should create personal session when rival is not waiting", async () => {
            const req = {
                body: {
                    type: "connect",
                    player: "Player",
                    uuuid: "player-uuid",
                    var: 1,
                    rival: { i: 42 },
                },
            }

            setupUserMocks()
            mockConnection.execute.mockResolvedValueOnce([
                [],
            ]) // rival not waiting

            mockConnection.query.mockResolvedValueOnce([
                { affectedRows: 1 },
            ])

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "connected",
                    sid: expect.any(String),
                })
            )
            // Verify session was created with target_rival_id
            const insertCall = mockConnection.query.mock.calls[0]
            expect(insertCall[0]).toContain("target_rival_id")
            expect(insertCall[1]).toContain(42)
        })

        it("should not join rival's session targeting someone else", async () => {
            const req = {
                body: {
                    type: "connect",
                    player: "Player",
                    uuuid: "player-uuid",
                    var: 1,
                    rival: { i: 42 },
                },
            }

            // Rival has a session but targeting user 99, not us (10).
            // The query uses (target_rival_id IS NULL OR target_rival_id = ?),
            // so this session would NOT be returned by the DB.
            setupUserMocks()
            mockConnection.execute.mockResolvedValueOnce([
                [],
            ]) // find rival's session - none matching

            mockConnection.query.mockResolvedValueOnce([
                { affectedRows: 1 },
            ])

            await connect(req, mockRes)

            // Should create new personal session, not join
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "connected",
                    sid: expect.any(String),
                })
            )
            const insertCall = mockConnection.query.mock.calls[0]
            expect(insertCall[0]).toContain("INSERT INTO game_sessions")
        })

        it("should pull random player into personal session targeting them", async () => {
            const req = {
                body: {
                    type: "connect",
                    player: "Player",
                    uuuid: "player-uuid",
                    var: 1,
                    // No rival - random game
                },
            }

            const personalForMe = {
                id: "4000",
                user_one_id: 42,
                user_one_name: "SomeoneWaitingForMe",
                status: 0,
                target_rival_id: 10, // targeting our user ID
            }

            setupUserMocks()
            mockConnection.execute.mockResolvedValueOnce([
                [personalForMe],
            ]) // personal session targeting me - found!

            mockConnection.query.mockResolvedValueOnce([
                { affectedRows: 1 },
            ])

            await connect(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "connected",
                    sid: "4001",
                })
            )
        })

        it("should exclude personal sessions from random matchmaking", async () => {
            const req = {
                body: {
                    type: "connect",
                    player: "Player",
                    uuuid: "player-uuid",
                    var: 1,
                },
            }

            setupUserMocks()
            mockConnection.execute
                .mockResolvedValueOnce([[]]) // personal targeting me - none
                .mockResolvedValueOnce([[]]) // random waiting - none

            mockConnection.query.mockResolvedValueOnce([
                { affectedRows: 1 },
            ])

            await connect(req, mockRes)

            // Find the random matchmaking query and verify it excludes personal sessions
            const randomQuery = mockConnection.execute.mock.calls.find(
                (call) =>
                    call[0] &&
                    call[0].includes("target_rival_id IS NULL") &&
                    call[0].includes("user_one_id != ?")
            )
            expect(randomQuery).toBeTruthy()
            expect(randomQuery[0]).toContain("target_rival_id IS NULL")
        })

        it("should match agent to personal session targeting it (agent rematch)", async () => {
            const req = {
                body: {
                    type: "connect",
                    player: "AgentBot",
                    uuuid: "agent-uuid",
                    var: 1,
                    v: 2100, // agent version
                },
            }

            const agentUser = {
                ...mockUser,
                id: 99,
                name: "AgentBot",
            }

            const personalForAgent = {
                id: "5000",
                user_one_id: 10,
                user_one_name: "HumanPlayer",
                status: 0,
                target_rival_id: 99, // human targeting this agent
            }

            mockConnection.execute
                .mockResolvedValueOnce([]) // SET TRANSACTION ISOLATION LEVEL
                .mockResolvedValueOnce([[agentUser]]) // find user
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // update login
                .mockResolvedValueOnce([{ affectedRows: 0 }]) // terminate
                .mockResolvedValueOnce([[{ game_variant: 1 }]]) // lock
                .mockResolvedValueOnce([[personalForAgent]]) // personal targeting agent

            mockConnection.query.mockResolvedValueOnce([
                { affectedRows: 1 },
            ])

            await connect(req, mockRes)

            // Agent should join the personal session targeting it
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "connected",
                    sid: "5001",
                })
            )
        })

        it("should let human rematch a specific agent", async () => {
            const req = {
                body: {
                    type: "connect",
                    player: "HumanPlayer",
                    uuuid: "human-uuid",
                    var: 1,
                    rival: { i: 99 }, // targeting specific agent
                },
            }

            const agentSession = {
                id: "6000",
                user_one_id: 99,
                user_one_name: "AgentBot",
                status: 0,
                target_rival_id: null, // agent waiting for anyone
                version_one: 2100,
            }

            setupUserMocks()
            mockConnection.execute.mockResolvedValueOnce([
                [agentSession],
            ]) // found agent's session

            mockConnection.query.mockResolvedValueOnce([
                { affectedRows: 1 },
            ])

            await connect(req, mockRes)

            // Human should join agent's session directly
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "connected",
                    sid: "6001",
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
