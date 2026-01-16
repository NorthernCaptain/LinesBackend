/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

jest.mock("mysql2/promise", () => ({
    createPool: jest.fn(() => ({
        execute: jest.fn(),
        getConnection: jest.fn(),
    })),
}))

describe("db/navalclash/pool", () => {
    beforeEach(() => {
        jest.resetModules()
    })

    it("should create a pool with correct configuration", () => {
        const mysql = require("mysql2/promise")
        require("./pool")

        expect(mysql.createPool).toHaveBeenCalledWith(
            expect.objectContaining({
                database: expect.any(String),
                waitForConnections: true,
                connectionLimit: 20,
                queueLimit: 0,
                timezone: "Z",
                supportBigNumbers: true,
                bigNumberStrings: false,
            })
        )
    })

    it("should export pool object", () => {
        const { pool } = require("./pool")
        expect(pool).toBeDefined()
        expect(pool.execute).toBeDefined()
    })
})
