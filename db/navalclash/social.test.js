/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mockExecute = jest.fn()

jest.mock("./pool", () => ({
    pool: {
        execute: mockExecute,
    },
}))

const {
    LIST_TYPE_FRIENDS,
    LIST_TYPE_BLOCKED,
    dbAddRival,
    dbDeleteRival,
    dbGetRivals,
    dbSearchUsers,
    dbGetRecentOpponents,
    dbGetWaitingUsers,
} = require("./social")

describe("db/navalclash/social", () => {
    beforeEach(() => {
        mockExecute.mockReset()
    })

    describe("constants", () => {
        it("should export list type constants", () => {
            expect(LIST_TYPE_FRIENDS).toBe(1)
            expect(LIST_TYPE_BLOCKED).toBe(2)
        })
    })

    describe("dbAddRival", () => {
        it("should add friend", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbAddRival(1, 2, "friend")

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO userlists"),
                [1, LIST_TYPE_FRIENDS, 2]
            )
        })

        it("should add blocked user", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbAddRival(1, 3, "block")

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(expect.any(String), [
                1,
                LIST_TYPE_BLOCKED,
                3,
            ])
        })

        it("should return false on error", async () => {
            mockExecute.mockRejectedValue(new Error("FK violation"))

            const result = await dbAddRival(1, 999, "friend")

            expect(result).toBe(false)
        })
    })

    describe("dbDeleteRival", () => {
        it("should delete friend", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbDeleteRival(1, 2, "friend")

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("DELETE FROM userlists"),
                [1, 2, LIST_TYPE_FRIENDS]
            )
        })

        it("should delete blocked user", async () => {
            mockExecute.mockResolvedValue([{ affectedRows: 1 }])

            const result = await dbDeleteRival(1, 3, "block")

            expect(result).toBe(true)
            expect(mockExecute).toHaveBeenCalledWith(expect.any(String), [
                1,
                3,
                LIST_TYPE_BLOCKED,
            ])
        })
    })

    describe("dbGetRivals", () => {
        it("should return friends and blocked lists", async () => {
            const mockRows = [
                {
                    list_type: LIST_TYPE_FRIENDS,
                    rival_id: 2,
                    name: "Friend1",
                    face: 1,
                    rank: 5,
                    stars: 10,
                    games: 100,
                    gameswon: 50,
                    uuid: "uuid-2",
                    status: 0,
                    lastseen: new Date(),
                },
                {
                    list_type: LIST_TYPE_BLOCKED,
                    rival_id: 3,
                    name: "Blocked1",
                    face: 2,
                    rank: 3,
                    stars: 5,
                    games: 20,
                    gameswon: 5,
                    uuid: "uuid-3",
                    status: 0,
                    lastseen: new Date(),
                },
            ]
            mockExecute.mockResolvedValue([mockRows])

            const result = await dbGetRivals(1)

            expect(result.friends).toHaveLength(1)
            expect(result.friends[0].name).toBe("Friend1")
            expect(result.blocked).toHaveLength(1)
            expect(result.blocked[0].name).toBe("Blocked1")
        })

        it("should return empty lists when no rivals", async () => {
            mockExecute.mockResolvedValue([[]])

            const result = await dbGetRivals(1)

            expect(result).toEqual({ friends: [], blocked: [] })
        })

        it("should return empty lists on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbGetRivals(1)

            expect(result).toEqual({ friends: [], blocked: [] })
        })
    })

    describe("dbSearchUsers", () => {
        it("should search by name pattern", async () => {
            const mockUsers = [{ id: 1, name: "TestPlayer" }]
            mockExecute.mockResolvedValue([mockUsers])

            const result = await dbSearchUsers("Test", null, 10)

            expect(result).toEqual(mockUsers)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("LIKE ?"),
                ["%Test%", 10]
            )
        })

        it("should search by exact name and PIN", async () => {
            const mockUsers = [{ id: 1, name: "Player" }]
            mockExecute.mockResolvedValue([mockUsers])

            const result = await dbSearchUsers("Player", 1234, 10)

            expect(result).toEqual(mockUsers)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("name = ? AND pin = ?"),
                ["Player", 1234]
            )
        })

        it("should return empty array on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbSearchUsers("Test", null, 10)

            expect(result).toEqual([])
        })
    })

    describe("dbGetRecentOpponents", () => {
        it("should return recent opponents with won flag", async () => {
            const mockRows = [
                { rival_id: 2, winner_id: 1, name: "Opponent1" },
                { rival_id: 3, winner_id: 3, name: "Opponent2" },
            ]
            mockExecute.mockResolvedValue([mockRows])

            const result = await dbGetRecentOpponents(1, 10)

            expect(result).toHaveLength(2)
            expect(result[0].won).toBe(1) // User 1 won
            expect(result[1].won).toBe(0) // User 1 lost
        })

        it("should return empty array on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbGetRecentOpponents(1, 10)

            expect(result).toEqual([])
        })
    })

    describe("dbGetWaitingUsers", () => {
        it("should return waiting users", async () => {
            const mockUsers = [{ user_id: 2, session_id: 1000n }]
            mockExecute.mockResolvedValue([mockUsers])

            const result = await dbGetWaitingUsers(1, 1, 10)

            expect(result).toEqual(mockUsers)
            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining("v_waiting_users"),
                [1, 1, 10]
            )
        })

        it("should return empty array on error", async () => {
            mockExecute.mockRejectedValue(new Error("DB error"))

            const result = await dbGetWaitingUsers(1, 1, 10)

            expect(result).toEqual([])
        })
    })
})
