/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

let requestCounter = 0
const pid = process.pid
const workerId = process.env.WORKER_ID || "0"

/**
 * Generates a unique request ID.
 *
 * @returns {string} Request ID in format "req-XXXXX"
 */
function generateRequestId() {
    requestCounter = (requestCounter + 1) % 100000
    return `req-${String(requestCounter).padStart(5, "0")}`
}

/**
 * Formats timestamp with milliseconds and process info.
 *
 * @returns {string} Timestamp in format "YYYY-MM-DD HH:mm:ss.SSS pid:workerId"
 */
function formatTimestamp() {
    const now = new Date()
    const pad = (n, len = 2) => String(n).padStart(len, "0")
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)} ${pid}:${workerId}`
}

/**
 * Express middleware for logging requests and responses.
 * Logs: timestamp requestId METHOD /path source-ip user-agent
 * On finish: timestamp requestId statusCode statusMessage
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
function requestLogger(req, res, next) {
    const requestId = generateRequestId()
    const startTime = Date.now()

    // Attach requestId to request for potential use elsewhere
    req.requestId = requestId

    // Get client IP (consider proxy headers)
    const sourceIp =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket?.remoteAddress ||
        "-"

    const userAgent = req.headers["user-agent"] || "-"

    // Log incoming request
    console.log(
        `${formatTimestamp()}: ${requestId} ${req.method} ${req.originalUrl} ${sourceIp} "${userAgent}"`
    )

    // Log response when finished
    res.on("finish", () => {
        const duration = Date.now() - startTime
        const status = res.statusCode
        const statusText = status >= 400 ? "Error" : "OK"
        console.log(
            `${formatTimestamp()}: ${requestId} ${status} ${statusText} (${duration}ms)`
        )
    })

    next()
}

module.exports = {
    requestLogger,
    formatTimestamp,
    generateRequestId,
}
