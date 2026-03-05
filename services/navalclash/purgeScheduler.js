/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 *
 * Unified purge scheduler for the cluster master process.
 * Coordinates session purge and device key purge so they never
 * run concurrently — if one fires while the other is in progress,
 * it defers until the running job completes.
 */

const { purgeStaleSessions } = require("./sessionPurge")
const { dbCleanupExpiredKeys } = require("../../db/navalclash/keys")
const { TIMING } = require("./constants")
const { logger } = require("../../utils/logger")

const DEVICE_KEY_PURGE_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

let sessionInterval = null
let deviceKeyInterval = null
let running = false
let pendingJobs = []

/**
 * Runs a purge job, or queues it if another job is already running.
 *
 * @param {string} name - Job name for logging
 * @param {Function} fn - Async function to execute
 */
function schedule(name, fn) {
    if (running) {
        // Only queue if this job isn't already pending
        if (!pendingJobs.some((j) => j.name === name)) {
            logger.debug({}, `Purge scheduler: deferring ${name}`)
            pendingJobs.push({ name, fn })
        }
        return
    }
    run(name, fn)
}

/**
 * Executes a purge job and drains the pending queue afterwards.
 *
 * @param {string} name - Job name for logging
 * @param {Function} fn - Async function to execute
 */
async function run(name, fn) {
    running = true
    try {
        await fn()
    } catch (error) {
        logger.error({}, `Purge scheduler: ${name} error:`, error.message)
    }
    running = false

    // Run next pending job if any
    if (pendingJobs.length > 0) {
        const next = pendingJobs.shift()
        run(next.name, next.fn)
    }
}

/**
 * Session purge tick — closes stale sessions and orphaned messages.
 */
async function sessionPurgeTick() {
    const thresholdSec = Math.floor(TIMING.SESSION_PURGE_MS / 1000)
    const closed = await purgeStaleSessions(thresholdSec)
    if (closed > 0) {
        logger.info({}, `Session purge: closed ${closed} stale session(s)`)
    }
}

/**
 * Device key purge tick — deletes expired device keys.
 */
async function deviceKeyPurgeTick() {
    const deleted = await dbCleanupExpiredKeys()
    if (deleted > 0) {
        logger.info({}, `Device key purge: deleted ${deleted} expired key(s)`)
    }
}

/**
 * Starts both purge jobs on their respective intervals.
 * Should be called once from the cluster master process.
 *
 * @returns {void}
 */
function startPurgeScheduler() {
    const sessionIntervalMs = TIMING.SESSION_PURGE_INTERVAL_MS

    logger.info(
        {},
        `Purge scheduler: starting` +
            ` (sessions every ${sessionIntervalMs}ms,` +
            ` device keys every ${DEVICE_KEY_PURGE_INTERVAL_MS}ms)`
    )

    sessionInterval = setInterval(() => {
        schedule("session-purge", sessionPurgeTick)
    }, sessionIntervalMs)
    sessionInterval.unref()

    deviceKeyInterval = setInterval(() => {
        schedule("device-key-purge", deviceKeyPurgeTick)
    }, DEVICE_KEY_PURGE_INTERVAL_MS)
    deviceKeyInterval.unref()
}

/**
 * Stops both purge jobs.
 *
 * @returns {void}
 */
function stopPurgeScheduler() {
    if (sessionInterval) {
        clearInterval(sessionInterval)
        sessionInterval = null
    }
    if (deviceKeyInterval) {
        clearInterval(deviceKeyInterval)
        deviceKeyInterval = null
    }
    pendingJobs = []
    running = false
}

module.exports = {
    DEVICE_KEY_PURGE_INTERVAL_MS,
    startPurgeScheduler,
    stopPurgeScheduler,
    // Exposed for testing
    schedule,
    sessionPurgeTick,
    deviceKeyPurgeTick,
}
