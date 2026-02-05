/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockExecute = jest.fn()
const mockSendMessage = jest.fn()

jest.mock("../../db/navalclash", () => ({
    pool: {
        execute: mockExecute,
    },
}))

jest.mock("./messageService", () => ({
    sendMessage: mockSendMessage,
}))

const {
    addRival,
    deleteRival,
    getRivals,
    searchUsers,
    getRecentOpponents,
    getOnlineUsers,
    userMarker,
    userAnswer,
    serializeRival,
    serializeSearchUser,
    findPendingInvitation,
} = require("./socialService")

const { LIST_TYPE, MSG } = require("./constants")
const LIST_TYPE_FRIENDS = LIST_TYPE.FRIENDS
const LIST_TYPE_BLOCKED = LIST_TYPE.BLOCKED
const MSG_PERSONAL_RIVAL_REQUEST = MSG.PERSONAL_RIVAL_REQUEST
const MSG_PERSONAL_RIVAL_ACCEPTED = MSG.PERSONAL_RIVAL_ACCEPTED
const MSG_PERSONAL_RIVAL_REJECTED = MSG.PERSONAL_RIVAL_REJECTED

describe("services/navalclash/socialService", () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe("serializeRival", () => {
        it("should serialize rival data correctly", () => {
            // Use a recent date to test elapsed time calculation
            const now = Date.now()
            const oneHourAgo = new Date(now - 60 * 60 * 1000) // 1 hour ago
            const row = {
                id: 123,
                rival_id: 123,
                name: "Player1",
                face: 5,
                rank: 10,
                stars: 50,
                games: 100,
                gameswon: 60,
                uuid: "test-uuid",
                status: 1,
                lastseen: oneHourAgo,
            }

            const result = serializeRival(row)

            // s should be elapsed seconds (approximately 3600 for 1 hour)
            expect(result.s).toBeGreaterThanOrEqual(3599)
            expect(result.s).toBeLessThanOrEqual(3601)
            expect(result).toMatchObject({
                type: "rnf",
                id: 123,
                rid: 123,
                n: "Player1",
                f: 5,
                r: 10,
                l: "--",
                g: 100,
                gw: 60,
                d: "",
                v: 0,
                uid: "test-uuid",
            })
        })

        it("should use id if rival_id is not present", () => {
            const row = { id: 456, name: "Test" }
            const result = serializeRival(row)
            expect(result.id).toBe(456)
            expect(result.rid).toBe(456)
        })

        it("should include type rnf field", () => {
            const row = { id: 1, name: "Test" }
            const result = serializeRival(row)
            expect(result.type).toBe("rnf")
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
                type: "rnf",
                id: 789,
                rid: 789,
                n: "SearchUser",
                f: 3,
                r: 5,
                l: "--",
                g: 30,
                gw: 15,
                d: "",
                v: 0,
                s: 0,
                uid: "search-uuid",
                t: 1, // TYPE_SEARCH
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
            expect(response.ar[0].t).toBe(3) // TYPE_SAVED (friends)
            expect(response.ar[2].t).toBe(4) // TYPE_REJECTED (blocked)
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
            const playedAt = new Date("2026-01-10T10:00:00Z")
            mockExecute
                .mockResolvedValueOnce([[{ id: 1, name: "TestUser" }]]) // User lookup
                .mockResolvedValueOnce([
                    [
                        {
                            rival_id: 10,
                            id: 10,
                            winner_id: 1,
                            played_at: playedAt,
                            name: "Opponent1",
                        },
                        {
                            rival_id: 11,
                            id: 11,
                            winner_id: 11,
                            played_at: playedAt,
                            name: "Opponent2",
                        },
                    ],
                ]) // Recent opponents query

            const req = { requestId: "test", body: { u: testUser } }

            await getRecentOpponents(req, mockRes)

            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("urcnt")
            expect(response.ar).toHaveLength(2)
            expect(response.ar[0].iw).toBe(1) // user id=1 won
            expect(response.ar[1].iw).toBe(0) // user id=1 lost
            expect(response.ar[0].t).toBe(2) // TYPE_RECENT
            expect(response.ar[0].gp).toBe(Math.floor(playedAt.getTime() / 1000)) // game played time
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
                        last_seen: -2,  // Setting up
                        is_playing: 0,
                    },
                ],
            ])

            const req = { requestId: "test", body: { var: 1 } }

            await getOnlineUsers(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("v_online_users"),
                [1, 0] // game variant 1, user ID 0 (not provided)
            )
            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("uair")
            expect(response.ar).toHaveLength(1)
            expect(response.ar[0].sid).toBe("1000")
            expect(response.ar[0].s).toBe(-2)  // Setting up
            expect(response.ar[0].ip).toBe(0)  // Not playing
        })

        it("should exclude current user from online list", async () => {
            mockExecute
                .mockResolvedValueOnce([[{ id: 5, name: "TestUser" }]]) // User lookup
                .mockResolvedValueOnce([[]]) // Online users (empty)

            const req = { requestId: "test", body: { u: testUser, var: 1 } }

            await getOnlineUsers(req, mockRes)

            expect(mockExecute).toHaveBeenLastCalledWith(
                expect.stringContaining("v_online_users"),
                [1, 5] // game variant 1, exclude user ID 5
            )
        })

        it("should use default game variant if not provided", async () => {
            mockExecute.mockResolvedValueOnce([[]])

            const req = { requestId: "test", body: {} }

            await getOnlineUsers(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(expect.anything(), [1, 0])
        })

        it("should return playing users without session ID", async () => {
            mockExecute.mockResolvedValueOnce([
                [
                    {
                        user_id: 10,
                        session_id: 1000n,
                        name: "PlayingUser",
                        face: 1,
                        last_seen: -1,  // Currently playing
                        is_playing: 1,
                    },
                ],
            ])

            const req = { requestId: "test", body: { var: 1 } }

            await getOnlineUsers(req, mockRes)

            const response = mockRes.json.mock.calls[0][0]
            expect(response.ar[0].sid).toBeNull()  // No session ID for playing users
            expect(response.ar[0].s).toBe(-1)  // Currently playing
            expect(response.ar[0].ip).toBe(1)  // Is playing
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

    describe("userAnswer", () => {
        const mockRes = { json: jest.fn() }
        const testUser = { id: "test-uuid", nam: "TestUser" }

        beforeEach(() => {
            mockRes.json.mockClear()
            mockSendMessage.mockClear()
            mockSendMessage.mockResolvedValue(1)
        })

        it("should return error for missing parameters", async () => {
            const req = { requestId: "test", body: {} }

            await userAnswer(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Missing parameters",
            })
        })

        it("should return error if user not found", async () => {
            mockExecute.mockResolvedValueOnce([[]]) // User not found

            const req = {
                requestId: "test",
                body: { u: testUser, ans: true, usid: "1000" },
            }

            await userAnswer(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "User not found",
            })
        })

        it("should return banned response for banned user", async () => {
            mockExecute.mockResolvedValueOnce([
                [{ id: 1, name: "BannedUser", isbanned: 1 }],
            ])

            const req = {
                requestId: "test",
                body: { u: testUser, ans: true, usid: "1000" },
            }

            await userAnswer(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "banned",
                msg: {
                    type: "msg",
                    m: 9,
                    p: [],
                    c: true,
                },
                errcode: 1,
            })
        })

        it("should send acceptance message to inviter", async () => {
            mockExecute
                .mockResolvedValueOnce([
                    [{ id: 1, name: "Responder", uuid: "resp-uuid", rank: 5, face: 2, isbanned: 0 }],
                ]) // User lookup
                .mockResolvedValueOnce([
                    [{ id: 1000, status: 0, user_one_id: 10 }],
                ]) // Session lookup

            const req = {
                requestId: "test",
                body: { u: testUser, ans: true, usid: "1000" },
            }

            await userAnswer(req, mockRes)

            expect(mockSendMessage).toHaveBeenCalledWith(
                1000n,
                "info",
                {
                    msg: {
                        type: "msg",
                        m: MSG_PERSONAL_RIVAL_ACCEPTED,
                        p: ["Responder"],
                        c: false,
                    },
                    u: expect.objectContaining({
                        nam: "Responder",
                        i: 1,
                        rk: 5,
                        fc: 2,
                    }),
                }
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "uok" })
        })

        it("should send rejection message to inviter", async () => {
            mockExecute
                .mockResolvedValueOnce([
                    [{ id: 1, name: "Responder", uuid: "resp-uuid", isbanned: 0 }],
                ]) // User lookup
                .mockResolvedValueOnce([
                    [{ id: 1000, status: 0, user_one_id: 10 }],
                ]) // Session lookup

            const req = {
                requestId: "test",
                body: { u: testUser, ans: false, usid: "1000" },
            }

            await userAnswer(req, mockRes)

            expect(mockSendMessage).toHaveBeenCalledWith(
                1000n,
                "info",
                expect.objectContaining({
                    msg: expect.objectContaining({
                        m: MSG_PERSONAL_RIVAL_REJECTED,
                    }),
                })
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "uok" })
        })

        it("should return uok if session not found", async () => {
            mockExecute
                .mockResolvedValueOnce([
                    [{ id: 1, name: "Responder", isbanned: 0 }],
                ]) // User lookup
                .mockResolvedValueOnce([[]]) // Session not found

            const req = {
                requestId: "test",
                body: { u: testUser, ans: true, usid: "9999" },
            }

            await userAnswer(req, mockRes)

            expect(mockSendMessage).not.toHaveBeenCalled()
            expect(mockRes.json).toHaveBeenCalledWith({ type: "uok" })
        })
    })

    describe("findPendingInvitation", () => {
        it("should return null when no pending invitation", async () => {
            mockExecute.mockResolvedValueOnce([[]])

            const result = await findPendingInvitation(10, 1)

            expect(result).toBeNull()
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("target_rival_id = ?"),
                [10, 1]
            )
        })

        it("should return invitation details when found", async () => {
            mockExecute.mockResolvedValueOnce([
                [
                    {
                        session_id: 1000n,
                        user_one_id: 5,
                        id: 5,
                        name: "Inviter",
                        uuid: "inviter-uuid",
                        face: 2,
                        rank: 10,
                        stars: 500,
                        games: 100,
                        gameswon: 60,
                        lang: "en",
                    },
                ],
            ])

            const result = await findPendingInvitation(10, 1)

            expect(result).toEqual({
                sessionId: 1000n,
                inviter: {
                    id: 5,
                    name: "Inviter",
                    uuid: "inviter-uuid",
                    face: 2,
                    rank: 10,
                    stars: 500,
                    games: 100,
                    gameswon: 60,
                    lang: "en",
                },
            })
        })

        it("should handle database errors gracefully", async () => {
            mockExecute.mockRejectedValueOnce(new Error("DB Error"))

            const result = await findPendingInvitation(10, 1)

            expect(result).toBeNull()
        })
    })

    describe("userMarker with pending invitations", () => {
        const mockRes = { json: jest.fn() }
        const testUser = { id: "test-uuid", nam: "TestUser" }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return uask when pending invitation exists", async () => {
            // Mock findUserFromRequest (user lookup)
            mockExecute
                .mockResolvedValueOnce([
                    [{ id: 10, name: "TestUser", isbanned: 0 }],
                ]) // User lookup
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users (status)
                .mockResolvedValueOnce([
                    [
                        {
                            session_id: 1000n,
                            user_one_id: 5,
                            id: 5,
                            name: "Inviter",
                            uuid: "inviter-uuid",
                            face: 2,
                            rank: 10,
                            stars: 500,
                            games: 100,
                            gameswon: 60,
                            lang: "en",
                        },
                    ],
                ]) // Pending invitation query

            const req = {
                requestId: "test",
                body: { u: testUser, var: 1 },
            }

            await userMarker(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "uask",
                usid: "1000",
                u: expect.objectContaining({
                    nam: "Inviter",
                    i: 5,
                    id: "inviter-uuid",
                    rk: 10,
                    st: 500,
                    fc: 2,
                }),
                msg: {
                    type: "msg",
                    m: MSG_PERSONAL_RIVAL_REQUEST,
                    p: ["Inviter"],
                    c: true,
                },
            })
        })

        it("should not check for invitations when session ID is provided", async () => {
            // Mock findUserBySession (SELECT from game_sessions + users)
            mockExecute
                .mockResolvedValueOnce([
                    [{ id: 1000, user_one_id: 10, user_two_id: null }],
                ]) // game_sessions
                .mockResolvedValueOnce([
                    [{ id: 10, name: "Player1", isbanned: 0 }],
                ]) // users
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users (status)
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE game_sessions (heartbeat)

            const req = {
                requestId: "test",
                body: { sid: "1000", tp: "edit", var: 1 },
            }

            await userMarker(req, mockRes)

            // Should return uok, not uask, because session ID was provided
            expect(mockRes.json).toHaveBeenCalledWith({ type: "uok" })
            // Should not have queried for pending invitations
            expect(mockExecute).not.toHaveBeenCalledWith(
                expect.stringContaining("target_rival_id"),
                expect.anything()
            )
        })

        it("should not check for invitations when user is banned", async () => {
            mockExecute
                .mockResolvedValueOnce([
                    [{ id: 10, name: "BannedUser", isbanned: 1 }],
                ]) // User lookup
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users (status)

            const req = {
                requestId: "test",
                body: { u: testUser, var: 1 },
            }

            await userMarker(req, mockRes)

            // Should return uok, not uask
            expect(mockRes.json).toHaveBeenCalledWith({ type: "uok" })
            // Should not have queried for pending invitations
            expect(mockExecute).not.toHaveBeenCalledWith(
                expect.stringContaining("target_rival_id"),
                expect.anything()
            )
        })

        it("should return uok when no pending invitation", async () => {
            mockExecute
                .mockResolvedValueOnce([
                    [{ id: 10, name: "TestUser", isbanned: 0 }],
                ]) // User lookup
                .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users (status)
                .mockResolvedValueOnce([[]]) // No pending invitations

            const req = {
                requestId: "test",
                body: { u: testUser, var: 1 },
            }

            await userMarker(req, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "uok" })
        })
    })

    describe("constants", () => {
        it("should export MSG_PERSONAL_RIVAL_REQUEST as 28", () => {
            expect(MSG_PERSONAL_RIVAL_REQUEST).toBe(28)
        })

        it("should export MSG_PERSONAL_RIVAL_ACCEPTED as 31", () => {
            expect(MSG_PERSONAL_RIVAL_ACCEPTED).toBe(31)
        })

        it("should export MSG_PERSONAL_RIVAL_REJECTED as 29", () => {
            expect(MSG_PERSONAL_RIVAL_REJECTED).toBe(29)
        })
    })
})
