/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { pool } = require("./pool")

const LIST_TYPE_FRIENDS = 1
const LIST_TYPE_BLOCKED = 2

/**
 * Adds a rival to user's list.
 *
 * @param {number} userId - User ID
 * @param {number} rivalId - Rival user ID
 * @param {string} type - List type ("friend" or "block")
 * @returns {Promise<boolean>} True if successful
 */
async function dbAddRival(userId, rivalId, type) {
    const listType = type === "block" ? LIST_TYPE_BLOCKED : LIST_TYPE_FRIENDS
    try {
        await pool.execute(
            `INSERT INTO userlists (user_id, list_type, rival_id)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE list_type = VALUES(list_type)`,
            [userId, listType, rivalId]
        )
        return true
    } catch (error) {
        console.error("dbAddRival error:", error)
        return false
    }
}

/**
 * Removes a rival from user's list.
 *
 * @param {number} userId - User ID
 * @param {number} rivalId - Rival user ID
 * @param {string} type - List type ("friend" or "block")
 * @returns {Promise<boolean>} True if successful
 */
async function dbDeleteRival(userId, rivalId, type) {
    const listType = type === "block" ? LIST_TYPE_BLOCKED : LIST_TYPE_FRIENDS
    try {
        await pool.execute(
            "DELETE FROM userlists WHERE user_id = ? AND rival_id = ? AND list_type = ?",
            [userId, rivalId, listType]
        )
        return true
    } catch (error) {
        console.error("dbDeleteRival error:", error)
        return false
    }
}

/**
 * Gets user's rival lists (friends and blocked).
 *
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Object with friends and blocked arrays
 */
async function dbGetRivals(userId) {
    try {
        const [rows] = await pool.execute(
            `SELECT ul.list_type, ul.rival_id,
                    u.name, u.face, u.rank, u.stars, u.games, u.gameswon,
                    u.uuid, u.status, u.updated_at as lastseen
             FROM userlists ul
             JOIN users u ON u.id = ul.rival_id
             WHERE ul.user_id = ?
             ORDER BY ul.list_type, u.name`,
            [userId]
        )

        const friends = []
        const blocked = []

        for (const row of rows) {
            const rival = {
                id: row.rival_id,
                name: row.name,
                face: row.face,
                rank: row.rank,
                stars: row.stars,
                games: row.games,
                gameswon: row.gameswon,
                uuid: row.uuid,
                status: row.status,
                lastseen: row.lastseen,
            }
            if (row.list_type === LIST_TYPE_FRIENDS) {
                friends.push(rival)
            } else {
                blocked.push(rival)
            }
        }

        return { friends, blocked }
    } catch (error) {
        console.error("dbGetRivals error:", error)
        return { friends: [], blocked: [] }
    }
}

/**
 * Searches users by name.
 *
 * @param {string} searchName - Name pattern to search
 * @param {number|null} pin - Optional PIN for exact match
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Array of user objects
 */
async function dbSearchUsers(searchName, pin, limit) {
    try {
        let query, params
        if (pin) {
            query = `SELECT id, name, face, \`rank\`, stars, games, gameswon, uuid, status
                     FROM users WHERE name = ? AND pin = ? LIMIT 1`
            params = [searchName, pin]
        } else {
            query = `SELECT id, name, face, \`rank\`, stars, games, gameswon, uuid, status
                     FROM users WHERE name LIKE ? ORDER BY games DESC LIMIT ?`
            params = [`%${searchName}%`, limit]
        }
        const [rows] = await pool.execute(query, params)
        return rows
    } catch (error) {
        console.error("dbSearchUsers error:", error)
        return []
    }
}

/**
 * Gets recent opponents for a user.
 *
 * @param {number} userId - User ID
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Array of opponent objects
 */
async function dbGetRecentOpponents(userId, limit) {
    try {
        const [rows] = await pool.execute(
            `SELECT DISTINCT
                CASE WHEN gs.user_one_id = ? THEN gs.user_two_id ELSE gs.user_one_id END as rival_id,
                gs.winner_id,
                gs.created_at as played_at,
                u.name, u.face, u.rank, u.stars, u.games, u.gameswon, u.uuid, u.status,
                u.updated_at as lastseen
             FROM game_sessions gs
             JOIN users u ON u.id = CASE WHEN gs.user_one_id = ? THEN gs.user_two_id ELSE gs.user_one_id END
             WHERE (gs.user_one_id = ? OR gs.user_two_id = ?)
               AND gs.status >= 10
               AND gs.user_two_id IS NOT NULL
             ORDER BY gs.created_at DESC
             LIMIT ?`,
            [userId, userId, userId, userId, limit]
        )
        return rows.map((row) => ({
            ...row,
            won: row.winner_id === userId ? 1 : 0,
        }))
    } catch (error) {
        console.error("dbGetRecentOpponents error:", error)
        return []
    }
}

/**
 * Gets users currently waiting for opponents.
 *
 * @param {number} gameVariant - Game variant
 * @param {number} excludeUserId - User ID to exclude
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Array of waiting users
 */
async function dbGetWaitingUsers(gameVariant, excludeUserId, limit) {
    try {
        const [rows] = await pool.execute(
            `SELECT * FROM v_waiting_users
             WHERE game_variant = ? AND user_id != ?
             ORDER BY updated_at DESC
             LIMIT ?`,
            [gameVariant, excludeUserId, limit]
        )
        return rows
    } catch (error) {
        console.error("dbGetWaitingUsers error:", error)
        return []
    }
}

module.exports = {
    LIST_TYPE_FRIENDS,
    LIST_TYPE_BLOCKED,
    dbAddRival,
    dbDeleteRival,
    dbGetRivals,
    dbSearchUsers,
    dbGetRecentOpponents,
    dbGetWaitingUsers,
}
