/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const {
    exportProfile,
    importProfile,
    syncProfile,
} = require("./profileService")

// Mock the database module
jest.mock("../../db/navalclash", () => {
    const mockPool = {
        getConnection: jest.fn(),
        execute: jest.fn(),
    }
    return {
        pool: mockPool,
        dbFindUserByUuidAndName: jest.fn(),
        dbFindUserByUuid: jest.fn(),
        dbFindUserByNameAndPin: jest.fn(),
        dbCreateUser: jest.fn(),
        dbSyncUserProfile: jest.fn(),
        dbUpdateProfileAndStats: jest.fn(),
        dbLogProfileAction: jest.fn(),
        dbGetUserWeaponArrays: jest.fn(),
    }
})

// Mock the logger
jest.mock("../../utils/logger", () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}))

const {
    pool,
    dbFindUserByUuidAndName,
    dbFindUserByUuid,
    dbFindUserByNameAndPin,
    dbCreateUser,
    dbSyncUserProfile,
    dbUpdateProfileAndStats,
    dbLogProfileAction,
    dbGetUserWeaponArrays,
} = require("../../db/navalclash")

describe("profileService", () => {
    let mockReq, mockRes, mockConn

    beforeEach(() => {
        jest.clearAllMocks()

        mockConn = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            execute: jest.fn(),
            release: jest.fn(),
        }
        pool.getConnection.mockResolvedValue(mockConn)

        mockRes = {
            json: jest.fn(),
        }

        dbGetUserWeaponArrays.mockResolvedValue({
            we: [0, 0, 0, 0, 0, 0],
            wu: [0, 0, 0, 0, 0, 0],
        })
    })

    describe("exportProfile", () => {
        it("should return error for missing user data", async () => {
            mockReq = { body: {} }

            await exportProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Invalid request",
            })
        })

        it("should return error for missing player name", async () => {
            mockReq = { body: { u: { id: "uuid123" } } }

            await exportProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Invalid request",
            })
        })

        it("should export existing user with PIN", async () => {
            const existingUser = {
                id: 42,
                name: "TestPlayer",
                uuid: "uuid123",
                pin: 1234,
                rank: 5,
                stars: 1000,
                games: 50,
                gameswon: 30,
                face: 2,
                coins: 500,
                lang: "en",
                timezone: -300,
                games_android: 10,
                games_bluetooth: 5,
                games_web: 30,
                games_passplay: 5,
                wins_android: 6,
                wins_bluetooth: 3,
                wins_web: 18,
                wins_passplay: 3,
            }

            mockReq = {
                body: {
                    u: {
                        nam: "TestPlayer",
                        id: "uuid123",
                        fc: 2,
                        ga: [10, 5, 30, 5],
                        wa: [6, 3, 18, 3],
                    },
                    v: 25,
                },
            }

            dbFindUserByUuidAndName.mockResolvedValue(existingUser)
            dbUpdateProfileAndStats.mockResolvedValue(true)

            await exportProfile(mockReq, mockRes)

            // Fast path: no transaction needed
            expect(mockConn.beginTransaction).not.toHaveBeenCalled()
            expect(dbUpdateProfileAndStats).toHaveBeenCalledWith(
                pool,
                42,
                mockReq.body.u
            )
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "uexpres",
                    id: 42,
                    pin: 1234,
                    u: expect.objectContaining({
                        nam: "TestPlayer",
                        i: 42,
                        pin: 1234,
                    }),
                })
            )
        })

        it("should create new user when not found", async () => {
            const newUser = {
                id: 99,
                name: "NewPlayer",
                pin: 5678,
                rank: 0,
                stars: 0,
                games: 0,
                gameswon: 0,
                face: 1,
                coins: 100,
                lang: "en",
                timezone: 0,
            }

            mockReq = {
                body: {
                    u: {
                        nam: "NewPlayer",
                        id: "newuuid",
                        fc: 1,
                        an: 100,
                    },
                    v: 25,
                },
            }

            dbFindUserByUuidAndName.mockResolvedValue(null)
            mockConn.execute
                .mockResolvedValueOnce([[]]) // PIN uniqueness check
                .mockResolvedValueOnce([{ insertId: 99 }]) // INSERT
                .mockResolvedValueOnce([[newUser]]) // SELECT after insert

            await exportProfile(mockReq, mockRes)

            expect(mockConn.commit).toHaveBeenCalled()
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "uexpres",
                    id: 99,
                })
            )
        })

        it("should generate PIN for existing user without one", async () => {
            const userWithoutPin = {
                id: 55,
                name: "NoPinPlayer",
                pin: null,
                rank: 1,
                stars: 100,
            }

            mockReq = {
                body: {
                    u: {
                        nam: "NoPinPlayer",
                        id: "uuid555",
                    },
                    v: 25,
                },
            }

            dbFindUserByUuidAndName.mockResolvedValue(userWithoutPin)
            dbUpdateProfileAndStats.mockResolvedValue(true)
            mockConn.execute
                .mockResolvedValueOnce([[]]) // PIN uniqueness check
                .mockResolvedValueOnce([{}]) // UPDATE PIN

            await exportProfile(mockReq, mockRes)

            // Transaction used only for PIN generation
            expect(mockConn.beginTransaction).toHaveBeenCalled()
            expect(mockConn.commit).toHaveBeenCalled()
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "uexpres",
                    pin: expect.any(Number),
                })
            )
        })

        it("should return error on DB failure", async () => {
            mockReq = {
                body: {
                    u: {
                        nam: "ErrorPlayer",
                        id: "uuid-error",
                    },
                },
            }

            dbFindUserByUuidAndName.mockRejectedValue(new Error("DB error"))

            await exportProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Server error",
            })
        })

        it("should rollback on error during new user creation", async () => {
            mockReq = {
                body: {
                    u: {
                        nam: "ErrorPlayer",
                        id: "uuid-error",
                    },
                },
            }

            dbFindUserByUuidAndName.mockResolvedValue(null)
            mockConn.execute.mockRejectedValue(new Error("INSERT failed"))

            await exportProfile(mockReq, mockRes)

            expect(mockConn.rollback).toHaveBeenCalled()
            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Server error",
            })
        })
    })

    describe("importProfile", () => {
        it("should return empty response for missing name", async () => {
            mockReq = { body: { pin: 1234 } }

            await importProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "uimpres" })
        })

        it("should return empty response for missing PIN", async () => {
            mockReq = { body: { name: "TestPlayer" } }

            await importProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "uimpres" })
        })

        it("should return empty response for invalid PIN", async () => {
            mockReq = { body: { name: "TestPlayer", pin: "notanumber" } }

            await importProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "uimpres" })
        })

        it("should return user data for valid name + PIN", async () => {
            const user = {
                id: 42,
                name: "TestPlayer",
                uuid: "uuid-test-42",
                pin: 1234,
                rank: 5,
                stars: 1000,
                games: 50,
                gameswon: 30,
                face: 2,
                coins: 500,
                lang: "en",
                timezone: -300,
                isbanned: 0,
                games_android: 10,
                games_bluetooth: 5,
                games_web: 30,
                games_passplay: 5,
                wins_android: 6,
                wins_bluetooth: 3,
                wins_web: 18,
                wins_passplay: 3,
            }

            mockReq = { body: { name: "TestPlayer", pin: "1234", v: 25 } }
            dbFindUserByNameAndPin.mockResolvedValue(user)

            await importProfile(mockReq, mockRes)

            expect(dbFindUserByNameAndPin).toHaveBeenCalledWith(
                "TestPlayer",
                1234
            )
            expect(mockRes.json).toHaveBeenCalledWith({
                type: "uimpres",
                u: expect.objectContaining({
                    nam: "TestPlayer",
                    dev: "",
                    id: "uuid-test-42",
                    ut: 2,
                    i: 42,
                    pin: 1234,
                    rk: 5,
                    st: 1000,
                    pld: 50,
                    won: 30,
                }),
            })
        })

        it("should return empty response when user not found", async () => {
            mockReq = { body: { name: "UnknownPlayer", pin: "9999" } }
            dbFindUserByNameAndPin.mockResolvedValue(null)

            await importProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "uimpres" })
        })

        it("should return empty response for banned user", async () => {
            const bannedUser = {
                id: 42,
                name: "BannedPlayer",
                pin: 1234,
                isbanned: 1,
            }

            mockReq = { body: { name: "BannedPlayer", pin: "1234" } }
            dbFindUserByNameAndPin.mockResolvedValue(bannedUser)

            await importProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "uimpres" })
        })

        it("should allow chat-banned user to import (isbanned=16)", async () => {
            const chatBannedUser = {
                id: 42,
                name: "ChatBanned",
                pin: 1234,
                isbanned: 16,
            }

            mockReq = { body: { name: "ChatBanned", pin: "1234" } }
            dbFindUserByNameAndPin.mockResolvedValue(chatBannedUser)

            await importProfile(mockReq, mockRes)

            // Chat ban should NOT block import (only game ban does)
            expect(mockRes.json).not.toHaveBeenCalledWith({ type: "uimpres" })
        })

        it("should return empty response on database error", async () => {
            mockReq = { body: { name: "TestPlayer", pin: "1234" } }
            dbFindUserByNameAndPin.mockRejectedValue(new Error("DB error"))

            await importProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "uimpres" })
        })

        it("should log import action on success", async () => {
            const user = {
                id: 42,
                name: "TestPlayer",
                pin: 1234,
                isbanned: 0,
            }

            mockReq = { body: { name: "TestPlayer", pin: "1234", v: 30 } }
            dbFindUserByNameAndPin.mockResolvedValue(user)

            await importProfile(mockReq, mockRes)

            expect(dbLogProfileAction).toHaveBeenCalledWith(
                42,
                "import",
                "v=30"
            )
        })
    })

    describe("syncProfile", () => {
        it("should return ok for valid sync request with existing user", async () => {
            const user = { id: 42, name: "TestPlayer" }
            mockReq = {
                body: {
                    u: {
                        id: "uuid123",
                        nam: "TestPlayer",
                        fc: 2,
                        l: "en",
                        tz: -300,
                        ga: [10, 5, 30, 5],
                        wa: [6, 3, 18, 3],
                    },
                    v: 25,
                    f: 1,
                },
            }

            dbFindUserByUuidAndName.mockResolvedValue(user)
            dbSyncUserProfile.mockResolvedValue(true)

            await syncProfile(mockReq, mockRes)

            expect(dbFindUserByUuidAndName).toHaveBeenCalledWith(
                "uuid123",
                "TestPlayer"
            )
            expect(dbSyncUserProfile).toHaveBeenCalledWith(
                42,
                mockReq.body.u,
                25
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })

        it("should find user by UUID only if not found by UUID+name", async () => {
            const user = { id: 42, name: "TestPlayer" }
            mockReq = {
                body: {
                    u: { id: "uuid123", nam: "TestPlayer" },
                    v: 25,
                },
            }

            dbFindUserByUuidAndName.mockResolvedValue(null)
            dbFindUserByUuid.mockResolvedValue(user)
            dbSyncUserProfile.mockResolvedValue(true)

            await syncProfile(mockReq, mockRes)

            expect(dbFindUserByUuidAndName).toHaveBeenCalledWith(
                "uuid123",
                "TestPlayer"
            )
            expect(dbFindUserByUuid).toHaveBeenCalledWith("uuid123")
            expect(dbSyncUserProfile).toHaveBeenCalledWith(
                42,
                mockReq.body.u,
                25
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })

        it("should create user when not found", async () => {
            mockReq = {
                body: {
                    u: { id: "new-uuid-123", nam: "NewPlayer" },
                    v: 25,
                    var: 1,
                },
            }

            dbFindUserByUuidAndName.mockResolvedValue(null)
            dbFindUserByUuid.mockResolvedValue(null)
            dbCreateUser.mockResolvedValue(99)
            dbSyncUserProfile.mockResolvedValue(true)

            await syncProfile(mockReq, mockRes)

            expect(dbCreateUser).toHaveBeenCalledWith({
                name: "NewPlayer",
                uuid: "new-uuid-123",
                gameVariant: 1,
            })
            expect(dbSyncUserProfile).toHaveBeenCalledWith(
                99,
                mockReq.body.u,
                25
            )
            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })

        it("should return ok even on error when ignoreErrors is set", async () => {
            mockReq = {
                body: {
                    u: { id: "uuid123" },
                    ig: 1, // ignoreErrors
                },
            }

            dbFindUserByUuidAndName.mockRejectedValue(new Error("DB error"))

            await syncProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })

        it("should return error when user creation fails and ignoreErrors not set", async () => {
            mockReq = {
                body: {
                    u: { id: "new-uuid-123", nam: "NewPlayer" },
                    v: 25,
                },
            }

            dbFindUserByUuidAndName.mockResolvedValue(null)
            dbFindUserByUuid.mockResolvedValue(null)
            dbCreateUser.mockResolvedValue(null) // Creation failed

            await syncProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Failed to create user",
            })
        })

        it("should return ok when user creation fails but ignoreErrors is set", async () => {
            mockReq = {
                body: {
                    u: { id: "new-uuid-123", nam: "NewPlayer" },
                    ig: 1, // ignoreErrors
                },
            }

            dbFindUserByUuidAndName.mockResolvedValue(null)
            dbFindUserByUuid.mockResolvedValue(null)
            dbCreateUser.mockResolvedValue(null) // Creation failed

            await syncProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })

        it("should return error for missing user data when ignoreErrors not set", async () => {
            mockReq = { body: {} }

            await syncProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "error",
                reason: "Invalid request",
            })
        })

        it("should return ok for missing user data when ignoreErrors is set", async () => {
            mockReq = { body: { ig: 1 } }

            await syncProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "ok" })
        })
    })
})
