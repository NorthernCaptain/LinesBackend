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

const {
    addRival,
    deleteRival,
    getRivals,
    searchUsers,
    getRecentOpponents,
    getOnlineUsers,
    userMarker,
    serializeRival,
    serializeSearchUser,
    LIST_TYPE_FRIENDS,
    LIST_TYPE_BLOCKED,
} = require("./socialService")

describe("services/navalclash/socialService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe("serializeRival", () => {
        it("should serialize rival data correctly", () => {
            const row = {
                rival_id: 123,
                name: "Player1",
                face: 5,
                rank: 10,
                stars: 50,
                games: 100,
                gameswon: 60,
                uuid: "test-uuid",
                status: 1,
                lastseen: new Date("2026-01-01"),
            }

            const result = serializeRival(row)

            expect(result).toEqual({
                id: 123,
                n: "Player1",
                f: 5,
                r: 10,
                s: 50,
                g: 100,
                w: 60,
                uuid: "test-uuid",
                st: 1,
                ls: row.lastseen,
            })
        })

        it("should use id if rival_id is not present", () => {
            const row = { id: 456, name: "Test" }
            const result = serializeRival(row)
            expect(result.id).toBe(456)
        })
    })

    describe("serializeSearchUser", () => {
        it("should serialize search user correctly", () => {
            const row = {
                id: 789,
                name: "SearchUser",
                face: 3,
                rank: 5,
                stars: 20,
                games: 30,
                gameswon: 15,
                uuid: "search-uuid",
                status: 0,
            }

            const result = serializeSearchUser(row)

            expect(result).toEqual({
                id: 789,
                n: "SearchUser",
                f: 3,
                r: 5,
                s: 20,
                g: 30,
                w: 15,
                uuid: "search-uuid",
                st: 0,
            })
        })
    })

    describe("addRival", () => {
        const mockRes = { json: jest.fn() }
        const testUser = { id: "test-uuid", nam: "TestUser" }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if missing parameters", async () => {
            await addRival({ requestId: "test", body: {} }, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Missing parameters",
            })
        })

        it("should return error if user not found", async () => {
            mockExecute.mockResolvedValueOnce([[]]) // User lookup returns empty

            const req = {
                requestId: "test",
                body: { u: testUser, rid: 2, tp: 1 },
            }

            await addRival(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "User not found",
            })
        })

        it("should add rival to friends list", async () => {
            mockExecute
                .mockResolvedValueOnce([[{ id: 1, name: "TestUser" }]]) // User lookup
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // Insert

            const req = {
                requestId: "test",
                body: { u: testUser, rid: 2, tp: LIST_TYPE_FRIENDS },
            }

            await addRival(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO userlists"),
                [1, LIST_TYPE_FRIENDS, 2]
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "uok" })
        })

        it("should add rival to blocked list", async () => {
            mockExecute
                .mockResolvedValueOnce([[{ id: 1, name: "TestUser" }]]) // User lookup
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // Insert

            const req = {
                requestId: "test",
                body: { u: testUser, rid: 2, tp: LIST_TYPE_BLOCKED },
            }

            await addRival(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO userlists"),
                [1, LIST_TYPE_BLOCKED, 2]
            )
        })
    })

    describe("deleteRival", () => {
        const mockRes = { json: jest.fn() }
        const testUser = { id: "test-uuid", nam: "TestUser" }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if missing parameters", async () => {
            await deleteRival(
                { requestId: "test", body: { u: testUser } },
                mockRes
            )

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Missing parameters",
            })
        })

        it("should return error if user not found", async () => {
            mockExecute.mockResolvedValueOnce([[]]) // User lookup returns empty

            const req = {
                requestId: "test",
                body: { u: testUser, rid: 2, tp: 1 },
            }

            await deleteRival(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "User not found",
            })
        })

        it("should delete rival from list", async () => {
            mockExecute
                .mockResolvedValueOnce([[{ id: 1, name: "TestUser" }]]) // User lookup
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // Delete

            const req = {
                requestId: "test",
                body: { u: testUser, rid: 2, tp: LIST_TYPE_FRIENDS },
            }

            await deleteRival(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("DELETE FROM userlists"),
                [1, 2, LIST_TYPE_FRIENDS]
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "uok" })
        })
    })

    describe("getRivals", () => {
        const mockRes = { json: jest.fn() }
        const testUser = { id: "test-uuid", nam: "TestUser" }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if missing user info", async () => {
            await getRivals({ requestId: "test", body: {} }, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Missing user info",
            })
        })

        it("should return empty array if user not found", async () => {
            mockExecute.mockResolvedValueOnce([[]]) // User lookup returns empty

            const req = { requestId: "test", body: { u: testUser } }

            await getRivals(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "usaved", ar: [] })
        })

        it("should return rivals with list type", async () => {
            mockExecute
                .mockResolvedValueOnce([[{ id: 1, name: "TestUser" }]]) // User lookup
                .mockResolvedValueOnce([
                    [
                        {
                            list_type: 1,
                            rival_id: 10,
                            id: 10,
                            name: "Friend1",
                        },
                        {
                            list_type: 1,
                            rival_id: 11,
                            id: 11,
                            name: "Friend2",
                        },
                        {
                            list_type: 2,
                            rival_id: 20,
                            id: 20,
                            name: "Blocked1",
                        },
                    ],
                ]) // Rivals query

            const req = { requestId: "test", body: { u: testUser } }

            await getRivals(req, mockRes)

            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("usaved")
            expect(response.ar).toHaveLength(3)
            expect(response.ar[0].t).toBe(1) // friends
            expect(response.ar[2].t).toBe(2) // blocked
        })
    })

    describe("searchUsers", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if missing search string", async () => {
            await searchUsers({ requestId: "test", body: {} }, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Missing search string",
            })
        })

        it("should search users by name", async () => {
            mockExecute.mockResolvedValueOnce([
                [
                    { id: 1, name: "TestUser", face: 1 },
                    { id: 2, name: "AnotherTest", face: 2 },
                ],
            ])

            const req = { requestId: "test", body: { str: "Test" } }

            await searchUsers(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("LIKE"),
                ["%Test%"]
            )
            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("ufound")
            expect(response.ar).toHaveLength(2)
        })

        it("should search by name and PIN", async () => {
            mockExecute.mockResolvedValueOnce([[{ id: 1, name: "ExactUser" }]])

            const req = {
                requestId: "test",
                body: { str: "ExactUser", pin: 1234 },
            }

            await searchUsers(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("pin = ?"),
                ["ExactUser", 1234]
            )
        })

        it("should respect limit parameter", async () => {
            mockExecute.mockResolvedValueOnce([[]])

            const req = {
                requestId: "test",
                body: { str: "Test", limit: 100 },
            }

            await searchUsers(req, mockRes)

            // Should cap at 50 - LIMIT is embedded in SQL string
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("LIMIT 50"),
                ["%Test%"]
            )
        })
    })

    describe("getRecentOpponents", () => {
        const mockRes = { json: jest.fn() }
        const testUser = { id: "test-uuid", nam: "TestUser" }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if missing user info", async () => {
            await getRecentOpponents({ requestId: "test", body: {} }, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Missing user info",
            })
        })

        it("should return empty array if user not found", async () => {
            mockExecute.mockResolvedValueOnce([[]]) // User lookup returns empty

            const req = { requestId: "test", body: { u: testUser } }

            await getRecentOpponents(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "urcnt", ar: [] })
        })

        it("should return recent opponents", async () => {
            mockExecute
                .mockResolvedValueOnce([[{ id: 1, name: "TestUser" }]]) // User lookup
                .mockResolvedValueOnce([
                    [
                        {
                            rival_id: 10,
                            id: 10,
                            winner_id: 1,
                            played_at: new Date(),
                            name: "Opponent1",
                        },
                        {
                            rival_id: 11,
                            id: 11,
                            winner_id: 11,
                            played_at: new Date(),
                            name: "Opponent2",
                        },
                    ],
                ]) // Recent opponents query

            const req = { requestId: "test", body: { u: testUser } }

            await getRecentOpponents(req, mockRes)

            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("urcnt")
            expect(response.ar).toHaveLength(2)
            expect(response.ar[0].won).toBe(1) // user id=1 won
            expect(response.ar[1].won).toBe(0) // user id=1 lost
        })
    })

    describe("getOnlineUsers", () => {
        const mockRes = { json: jest.fn() }
        const testUser = { id: "test-uuid", nam: "TestUser" }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return online users without requiring user", async () => {
            mockExecute.mockResolvedValueOnce([
                [
                    {
                        user_id: 10,
                        session_id: 1000n,
                        name: "WaitingUser",
                        face: 1,
                    },
                ],
            ])

            const req = { requestId: "test", body: { var: 1 } }

            await getOnlineUsers(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("v_waiting_users"),
                [1, 0] // game variant 1, user ID 0 (not provided)
            )
            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("uair")
            expect(response.ar).toHaveLength(1)
            expect(response.ar[0].sid).toBe("1000")
        })

        it("should exclude current user from online list", async () => {
            mockExecute
                .mockResolvedValueOnce([[{ id: 5, name: "TestUser" }]]) // User lookup
                .mockResolvedValueOnce([[]]) // Online users (empty)

            const req = { requestId: "test", body: { u: testUser, var: 1 } }

            await getOnlineUsers(req, mockRes)

            expect(mockExecute).toHaveBeenLastCalledWith(
                expect.stringContaining("v_waiting_users"),
                [1, 5] // game variant 1, exclude user ID 5
            )
        })

        it("should use default game variant if not provided", async () => {
            mockExecute.mockResolvedValueOnce([[]])

            const req = { requestId: "test", body: {} }

            await getOnlineUsers(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(expect.anything(), [1, 0])
        })
    })

    describe("userMarker", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return uok if user not found", async () => {
            // No user found by session or user info
            await userMarker({ requestId: "test", body: {} }, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "uok" })
        })

        it("should update user status and session heartbeat for edit marker", async () => {
            // Mock findUserBySession (SELECT from game_sessions + users)
            mockExecute
                .mockResolvedValueOnce([
                    [{ id: 1000, user_one_id: 10, user_two_id: null }],
                ]) // game_sessions
                .mockResolvedValueOnce([[{ id: 10, name: "Player1" }]]) // users
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users (status)
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE game_sessions (heartbeat)

            const req = {
                requestId: "test",
                body: { sid: "1000", tp: "edit" },
            }

            await userMarker(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "uok" })
        })

        it("should close session for left marker", async () => {
            // Mock findUserBySession
            mockExecute
                .mockResolvedValueOnce([
                    [{ id: 1000, user_one_id: 10, user_two_id: null }],
                ]) // game_sessions
                .mockResolvedValueOnce([[{ id: 10, name: "Player1" }]]) // users
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users (status)
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE game_sessions (close)

            const req = {
                requestId: "test",
                body: { sid: "1000", tp: "left" },
            }

            await userMarker(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("status = 12"),
                expect.anything()
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "uok" })
        })

        it("should handle odd session IDs (player 1)", async () => {
            // Mock findUserBySession for player 1 (odd session ID)
            mockExecute
                .mockResolvedValueOnce([
                    [{ id: 1000, user_one_id: 10, user_two_id: 20 }],
                ]) // game_sessions
                .mockResolvedValueOnce([[{ id: 20, name: "Player2" }]]) // users (player 2)
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users (status)
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE game_sessions (heartbeat)

            const req = {
                requestId: "test",
                body: { sid: "1001", tp: "edit" },
            }

            await userMarker(req, mockRes)

            // Should use base session ID (1000) for session update
            expect(mockRes.json).toHaveBeenCalledWith({ type: "uok" })
        })
    })
})
