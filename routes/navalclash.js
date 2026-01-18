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
    const {
        greeting,
        fieldRequest,
        fieldInfo,
        shoot,
        yourTurn,
        info,
        chat,
        finish,
        dutchMove,
        shipMove,
    } = require("../services/navalclash/gameService")
    const {
        addRival,
        deleteRival,
        getRivals,
        searchUsers,
        getRecentOpponents,
        getOnlineUsers,
        userMarker,
    } = require("../services/navalclash/socialService")
    const { getTopScores } = require("../services/navalclash/leaderboardService")
    const {
        getItemsList,
        getInventory,
    } = require("../services/navalclash/shopService")

    // Phase 1: Connect & Users
    r.post("/connect", connect)
    r.post("/reconnect", reconnect)

    // Phase 2: Message Queue & Long Polling
    r.post("/receive", poll)
    r.post("/send", send)

    // Phase 3: Basic Game Flow
    r.post("/greeting", greeting)
    r.post("/fldreq", fieldRequest)
    r.post("/fldinfo", fieldInfo)
    r.post("/shoot", shoot)
    r.post("/yourturn", yourTurn)
    r.post("/info", info)
    r.post("/chat", chat)
    r.post("/fin", finish)
    r.post("/dutch", dutchMove)
    r.post("/smove", shipMove)

    // Phase 4: Social Features
    r.post("/umarker", userMarker)
    r.post("/uaddrival", addRival)
    r.post("/udelrival", deleteRival)
    r.post("/urivals", getRivals)
    r.post("/usearch", searchUsers)
    r.post("/ugetrcnt", getRecentOpponents)
    r.post("/ugetair", getOnlineUsers)

    // Phase 5: Leaderboard & Shop (no Google billing)
    r.post("/topTen", getTopScores)
    r.post("/ils", getItemsList)
    r.post("/inventory", getInventory)

    // Phase 6 routes will be added as that phase is implemented
    // r.post("/ufv", syncProfile)
    // r.post("/uexp", exportProfile)
    // r.post("/uimp", importProfile)

    return r
}

module.exports = { router }
