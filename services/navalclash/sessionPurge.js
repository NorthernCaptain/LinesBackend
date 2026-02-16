/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 *
 * Background session purge job.
 * Runs in the cluster master process to clean up stale sessions
 * where players have stopped polling.
 */

const { pool } = require("../../db/navalclash/pool")
const { TIMING } = require("./constants")

const SESSION_STATUS = {
    FINISHED_TIMED_OUT_WAITING: 5,
    FINISHED_TIMED_OUT_PLAYING: 6,
}

/**
 * Finds and closes stale sessions.
 * - WAITING sessions where player one is stale (>purgeThreshold) → FINISHED_TIMED_OUT_WAITING
 * - IN_PROGRESS sessions where both players are stale (>purgeThreshold) → FINISHED_TIMED_OUT_PLAYING
 *
 * @param {number} purgeThresholdSec - Seconds of inactivity before purge
 * @returns {Promise<number>} Number of sessions closed
 */
async function purgeStaleSessions(purgeThresholdSec) {
    let closed = 0
    try {
        // Find stale waiting sessions (status=0, player one inactive)
        const [waitingRows] = await pool.execute(
            `SELECT id FROM game_sessions
             WHERE status = 0
               AND (
                   last_seen_one IS NULL
                   OR last_seen_one < DATE_SUB(NOW(3), INTERVAL ? SECOND)
               )
             LIMIT 100`,
            [purgeThresholdSec]
        )

        for (const row of waitingRows) {
            const [result] = await pool.execute(
                `UPDATE game_sessions SET
                    status = ?,
                    finished_at = NOW(3)
                 WHERE id = ? AND status = 0`,
                [SESSION_STATUS.FINISHED_TIMED_OUT_WAITING, row.id.toString()]
            )
            if (result.affectedRows > 0) closed++
        }

        // Find stale in-progress sessions (status=1, both players inactive)
        const [playingRows] = await pool.execute(
            `SELECT id FROM game_sessions
             WHERE status = 1
               AND (
                   last_seen_one IS NULL
                   OR last_seen_one < DATE_SUB(NOW(3), INTERVAL ? SECOND)
               )
               AND (
                   last_seen_two IS NULL
                   OR last_seen_two < DATE_SUB(NOW(3), INTERVAL ? SECOND)
               )
             LIMIT 100`,
            [purgeThresholdSec, purgeThresholdSec]
        )

        for (const row of playingRows) {
            const [result] = await pool.execute(
                `UPDATE game_sessions SET
                    status = ?,
                    finished_at = NOW(3)
                 WHERE id = ? AND status = 1`,
                [SESSION_STATUS.FINISHED_TIMED_OUT_PLAYING, row.id.toString()]
            )
            if (result.affectedRows > 0) closed++
        }

        // Clean up old messages from closed sessions (older than 1 hour)
        await pool.execute(
            `DELETE sm FROM session_messages sm
             LEFT JOIN game_sessions gs ON gs.id = (sm.sender_session_id & ~1)
             WHERE gs.id IS NULL
                OR (gs.status > 1 AND gs.finished_at < DATE_SUB(NOW(), INTERVAL 1 HOUR))
             LIMIT 500`
        )
    } catch (error) {
        console.error("Session purge error:", error.message)
    }

    return closed
}

let purgeInterval = null

/**
 * Starts the background session purge job.
 * Should be called from the cluster master process.
 *
 * @returns {void}
 */
function startSessionPurge() {
    const intervalMs = TIMING.SESSION_PURGE_INTERVAL_MS
    const thresholdSec = Math.floor(TIMING.SESSION_PURGE_MS / 1000)

    console.log(
        `Session purge: starting (interval=${intervalMs}ms, threshold=${thresholdSec}s)`
    )

    purgeInterval = setInterval(async () => {
        const closed = await purgeStaleSessions(thresholdSec)
        if (closed > 0) {
            console.log(`Session purge: closed ${closed} stale session(s)`)
        }
    }, intervalMs)

    // Don't block process exit
    purgeInterval.unref()
}

/**
 * Stops the background session purge job.
 *
 * @returns {void}
 */
function stopSessionPurge() {
    if (purgeInterval) {
        clearInterval(purgeInterval)
        purgeInterval = null
    }
}

module.exports = {
    purgeStaleSessions,
    startSessionPurge,
    stopSessionPurge,
}
