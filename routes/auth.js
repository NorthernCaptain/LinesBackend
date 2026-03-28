/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */
const express = require("express")
const { wrap } = require("@awaitjs/express")
const { rateLimit } = require("express-rate-limit")
const {
    registerUser,
    loginUser,
    logoutUser,
} = require("../services/authService")

const router = express.Router()

const loginLimiter = rateLimit({
    windowMs: 60_000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: "Too many login attempts, try again later",
    },
})

const registerLimiter = rateLimit({
    windowMs: 60_000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: "Too many register attempts, try again later",
    },
})

const setup = (app) => {
    router.post(
        "/register",
        registerLimiter,
        app.oauth.authorise(),
        wrap(registerUser)
    )
    router.post("/login", loginLimiter, app.oauth.grant(), loginUser)
    router.post("/logout", app.oauth.authorise(), wrap(logoutUser))

    return router
}

exports.router = setup
