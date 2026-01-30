/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { exportProfile, importProfile } = require("./profileService")

// Mock the database module
jest.mock("../../db/navalclash", () => {
    const mockPool = {
        getConnection: jest.fn(),
        execute: jest.fn(),
    }
    return {
        pool: mockPool,
        dbFindUserByUuidAndName: jest.fn(),
        dbFindUserByNameAndPin: jest.fn(),
        dbUpdateUserProfile: jest.fn(),
        dbUpdateLocalStats: jest.fn(),
        dbLogProfileAction: jest.fn(),
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
    dbFindUserByNameAndPin,
    dbUpdateUserProfile,
    dbUpdateLocalStats,
    dbLogProfileAction,
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
                pin: 1234,
                rank: 5,
                stars: 1000,
                games: 50,
                gameswon: 30,
                face: 2,
                coins: 500,
                lang: "en",
                tz: -300,
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
            dbUpdateUserProfile.mockResolvedValue(true)
            dbUpdateLocalStats.mockResolvedValue(true)
            mockConn.execute.mockResolvedValue([[existingUser]])

            await exportProfile(mockReq, mockRes)

            expect(mockConn.beginTransaction).toHaveBeenCalled()
            expect(mockConn.commit).toHaveBeenCalled()
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
                tz: 0,
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
                .mockResolvedValueOnce([[]])  // PIN uniqueness check
                .mockResolvedValueOnce([{ insertId: 99 }])  // INSERT
                .mockResolvedValueOnce([[newUser]])  // SELECT after insert

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
            const userWithPin = { ...userWithoutPin, pin: 9999 }

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
            dbUpdateUserProfile.mockResolvedValue(true)
            mockConn.execute
                .mockResolvedValueOnce([[]])  // PIN uniqueness check
                .mockResolvedValueOnce([{}])  // UPDATE PIN
                .mockResolvedValueOnce([[userWithPin]])  // SELECT after update

            await exportProfile(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "uexpres",
                    pin: expect.any(Number),
                })
            )
        })

        it("should rollback on error", async () => {
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
                pin: 1234,
                rank: 5,
                stars: 1000,
                games: 50,
                gameswon: 30,
                face: 2,
                coins: 500,
                lang: "en",
                tz: -300,
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

            expect(dbFindUserByNameAndPin).toHaveBeenCalledWith("TestPlayer", 1234)
            expect(mockRes.json).toHaveBeenCalledWith({
                type: "uimpres",
                u: expect.objectContaining({
                    nam: "TestPlayer",
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

            expect(dbLogProfileAction).toHaveBeenCalledWith(42, "import", "v=30")
        })
    })
})
