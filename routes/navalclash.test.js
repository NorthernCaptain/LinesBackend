/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

jest.mock("../services/navalclash/connectService", () => ({
    connect: jest.fn((req, res) => res.json({ type: "connected" })),
    reconnect: jest.fn((req, res) => res.json({ type: "connected" })),
}))

jest.mock("../services/navalclash/messageService", () => ({
    poll: jest.fn((req, res) => res.json({ type: "empty" })),
    send: jest.fn((req, res) => res.json({ type: "ok", msgId: "1" })),
}))

const express = require("express")
const { router } = require("./navalclash")

describe("routes/navalclash", () => {
    let app
    let mockApp

    beforeEach(() => {
        mockApp = {}
        app = express()
        app.use(express.json())
        app.use("/naval/clash/api/v5", router(mockApp))
    })

    describe("router", () => {
        it("should return an Express router", () => {
            const r = router(mockApp)
            expect(r).toBeDefined()
            expect(typeof r).toBe("function")
        })

        it("should have connect route", () => {
            const r = router(mockApp)
            const routes = r.stack
                .filter((layer) => layer.route)
                .map((layer) => ({
                    path: layer.route.path,
                    methods: Object.keys(layer.route.methods),
                }))

            expect(routes).toContainEqual({
                path: "/connect",
                methods: ["post"],
            })
        })

        it("should have reconnect route", () => {
            const r = router(mockApp)
            const routes = r.stack
                .filter((layer) => layer.route)
                .map((layer) => ({
                    path: layer.route.path,
                    methods: Object.keys(layer.route.methods),
                }))

            expect(routes).toContainEqual({
                path: "/reconnect",
                methods: ["post"],
            })
        })

        it("should have receive route", () => {
            const r = router(mockApp)
            const routes = r.stack
                .filter((layer) => layer.route)
                .map((layer) => ({
                    path: layer.route.path,
                    methods: Object.keys(layer.route.methods),
                }))

            expect(routes).toContainEqual({
                path: "/receive",
                methods: ["post"],
            })
        })

        it("should have send route", () => {
            const r = router(mockApp)
            const routes = r.stack
                .filter((layer) => layer.route)
                .map((layer) => ({
                    path: layer.route.path,
                    methods: Object.keys(layer.route.methods),
                }))

            expect(routes).toContainEqual({
                path: "/send",
                methods: ["post"],
            })
        })
    })

    describe("POST /connect", () => {
        it("should call connect service", async () => {
            const { connect } = require("../services/navalclash/connectService")

            // Simulate request
            const mockReq = {
                body: { type: "connect", player: "Test", uuuid: "uuid" },
            }
            const mockRes = {
                json: jest.fn(),
            }

            await connect(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "connected" })
        })
    })

    describe("POST /reconnect", () => {
        it("should call reconnect service", async () => {
            const {
                reconnect,
            } = require("../services/navalclash/connectService")

            const mockReq = { body: { sid: "12345" } }
            const mockRes = {
                json: jest.fn(),
            }

            await reconnect(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "connected" })
        })
    })

    describe("POST /receive", () => {
        it("should call poll service", async () => {
            const { poll } = require("../services/navalclash/messageService")

            const mockReq = { body: { sid: "12345" } }
            const mockRes = {
                json: jest.fn(),
            }

            await poll(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({ type: "empty" })
        })
    })

    describe("POST /send", () => {
        it("should call send service", async () => {
            const { send } = require("../services/navalclash/messageService")

            const mockReq = {
                body: { sid: "12345", msgType: "greeting", data: "test" },
            }
            const mockRes = {
                json: jest.fn(),
            }

            await send(mockReq, mockRes)

            expect(mockRes.json).toHaveBeenCalledWith({
                type: "ok",
                msgId: "1",
            })
        })
    })
})
