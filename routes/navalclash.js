/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const express = require("express")

/**
 * Creates and configures the Naval Clash router.
 *
 * @param {Object} app - Express application instance
 * @returns {Object} Express router with all Naval Clash routes
 */
function router(app) {
    const r = express.Router()

    // Import services
    const {
        connect,
        reconnect,
    } = require("../services/navalclash/connectService")
    const { poll, send } = require("../services/navalclash/messageService")

    // Phase 1: Connect & Users
    r.post("/connect", connect)
    r.post("/reconnect", reconnect)

    // Phase 2: Message Queue & Long Polling
    r.post("/receive", poll)
    r.post("/send", send)

    // Phase 3-6 routes will be added as those phases are implemented
    // r.post("/ufv", syncProfile)
    // r.post("/uexp", exportProfile)
    // r.post("/uimp", importProfile)
    // r.post("/greeting", greeting)
    // ... etc

    return r
}

module.exports = { router }
