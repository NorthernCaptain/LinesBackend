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

        it("should add rival to friends list", async () => {
            mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }])

            const req = {
                requestId: "test",
                body: { uid: 1, rivalId: 2, type: "friend" },
            }

            await addRival(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO userlists"),
                [1, LIST_TYPE_FRIENDS, 2]
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })

        it("should add rival to blocked list", async () => {
            mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }])

            const req = {
                requestId: "test",
                body: { uid: 1, rivalId: 2, type: "block" },
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

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if missing parameters", async () => {
            await deleteRival({ requestId: "test", body: { uid: 1 } }, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Missing parameters",
            })
        })

        it("should delete rival from list", async () => {
            mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }])

            const req = {
                requestId: "test",
                body: { uid: 1, rivalId: 2, type: "friend" },
            }

            await deleteRival(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("DELETE FROM userlists"),
                [1, 2, LIST_TYPE_FRIENDS]
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })
    })

    describe("getRivals", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if missing user ID", async () => {
            await getRivals({ requestId: "test", body: {} }, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Missing user ID",
            })
        })

        it("should return friends and blocked lists", async () => {
            mockExecute.mockResolvedValueOnce([
                [
                    { list_type: 1, rival_id: 10, name: "Friend1" },
                    { list_type: 1, rival_id: 11, name: "Friend2" },
                    { list_type: 2, rival_id: 20, name: "Blocked1" },
                ],
            ])

            const req = { requestId: "test", body: { uid: 1 } }

            await getRivals(req, mockRes)

            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("rivals")
            expect(response.friends).toHaveLength(2)
            expect(response.blocked).toHaveLength(1)
        })
    })

    describe("searchUsers", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if missing name", async () => {
            await searchUsers({ requestId: "test", body: {} }, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Missing search name",
            })
        })

        it("should search users by name", async () => {
            mockExecute.mockResolvedValueOnce([
                [
                    { id: 1, name: "TestUser", face: 1 },
                    { id: 2, name: "AnotherTest", face: 2 },
                ],
            ])

            const req = { requestId: "test", body: { name: "Test" } }

            await searchUsers(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("LIKE"),
                ["%Test%", 20]
            )
            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("users")
            expect(response.list).toHaveLength(2)
        })

        it("should search by name and PIN", async () => {
            mockExecute.mockResolvedValueOnce([[{ id: 1, name: "ExactUser" }]])

            const req = {
                requestId: "test",
                body: { name: "ExactUser", pin: 1234 },
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
                body: { name: "Test", limit: 100 },
            }

            await searchUsers(req, mockRes)

            // Should cap at 50
            expect(mockExecute).toHaveBeenCalledWith(
                expect.anything(),
                ["%Test%", 50]
            )
        })
    })

    describe("getRecentOpponents", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if missing user ID", async () => {
            await getRecentOpponents({ requestId: "test", body: {} }, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Missing user ID",
            })
        })

        it("should return recent opponents", async () => {
            mockExecute.mockResolvedValueOnce([
                [
                    {
                        rival_id: 10,
                        winner_id: 1,
                        played_at: new Date(),
                        name: "Opponent1",
                    },
                    {
                        rival_id: 11,
                        winner_id: 11,
                        played_at: new Date(),
                        name: "Opponent2",
                    },
                ],
            ])

            const req = { requestId: "test", body: { uid: 1 } }

            await getRecentOpponents(req, mockRes)

            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("recent")
            expect(response.list).toHaveLength(2)
            expect(response.list[0].won).toBe(1) // uid=1 won
            expect(response.list[1].won).toBe(0) // uid=1 lost
        })
    })

    describe("getOnlineUsers", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return online users", async () => {
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

            const req = { requestId: "test", body: { uid: 1, var: 1 } }

            await getOnlineUsers(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("v_waiting_users"),
                [1, 1]
            )
            const response = mockRes.json.mock.calls[0][0]
            expect(response.type).toBe("online")
            expect(response.list).toHaveLength(1)
            expect(response.list[0].sid).toBe("1000")
        })

        it("should use default game variant if not provided", async () => {
            mockExecute.mockResolvedValueOnce([[]])

            const req = { requestId: "test", body: { uid: 1 } }

            await getOnlineUsers(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(expect.anything(), [1, 1])
        })
    })

    describe("userMarker", () => {
        const mockRes = { json: jest.fn() }

        beforeEach(() => {
            mockRes.json.mockClear()
        })

        it("should return error if missing session ID", async () => {
            await userMarker({ requestId: "test", body: {} }, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "No session",
            })
        })

        it("should update heartbeat for edit marker", async () => {
            mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }])

            const req = {
                requestId: "test",
                body: { sid: "1000", tp: "edit" },
            }

            await userMarker(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("UPDATE game_sessions"),
                ["1000"]
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })

        it("should close session for left marker", async () => {
            mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }])

            const req = {
                requestId: "test",
                body: { sid: "1000", tp: "left" },
            }

            await userMarker(req, mockRes)

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("status = 12"),
                ["1000"]
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })

        it("should handle odd session IDs (player 1)", async () => {
            mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }])

            const req = {
                requestId: "test",
                body: { sid: "1001", tp: "edit" },
            }

            await userMarker(req, mockRes)

            // Should use base session ID (1000)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.anything(),
                ["1000"]
            )
        })
    })
})
