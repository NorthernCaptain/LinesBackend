/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("./pool")
const users = require("./users")
const devices = require("./devices")
const sessions = require("./sessions")
const messages = require("./messages")
const social = require("./social")
const leaderboard = require("./leaderboard")
const shop = require("./shop")
const training = require("./training")

module.exports = {
    pool,
    ...users,
    ...devices,
    ...sessions,
    ...messages,
    ...social,
    ...leaderboard,
    ...shop,
    ...training,
}
