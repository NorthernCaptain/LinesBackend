/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const mysql = require("mysql2/promise")

/**
 * Creates and exports the database connection pool.
 */
const pool = mysql.createPool({
    host: process.env.NC_DB_HOST || process.env.db_host,
    database: process.env.NC_DB_NAME || "navalclash",
    user: process.env.NC_DB_USER || process.env.db_nc_user,
    password: process.env.NC_DB_PASSWORD || process.env.db_nc_password,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    timezone: "Z",
    supportBigNumbers: true,
    bigNumberStrings: false,
})

module.exports = { pool }
