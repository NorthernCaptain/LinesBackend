/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const { v4: uuid } = require("uuid")

const pid = String(process.pid).padStart(7, " ")
const workerId = String(process.env.WORKER_ID || "0").padStart(2, " ")

/**
 * Log levels for filtering output.
 */
const LOG_LEVEL = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
}

// Current log level (can be set via environment variable)
const currentLogLevel = LOG_LEVEL[process.env.LOG_LEVEL] || LOG_LEVEL.DEBUG

/**
 * Generates a unique request ID (8-char UUID prefix).
 *
 * @returns {string} Request ID in format "xxxxxxxx"
 */
function generateRequestId() {
    return uuid().substring(0, 8)
}

/**
 * Formats timestamp with milliseconds and process info.
 *
 * @returns {string} Timestamp in format "YYYY-MM-DD HH:mm:ss.SSS pid:workerId:"
 */
function formatTimestamp() {
    const now = new Date()
    const pad = (n, len = 2) => String(n).padStart(len, "0")
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)} ${pid}:${workerId}:`
}

/**
 * Formats context object into a readable string.
 * Handles BigInt conversion and nested objects.
 *
 * @param {Object} ctx - Context object with ids and metadata
 * @returns {string} Formatted context string
 */
function formatContext(ctx) {
    if (!ctx || Object.keys(ctx).length === 0) return ""

    const parts = []
    for (const [key, value] of Object.entries(ctx)) {
        if (value === undefined || value === null) continue
        if (typeof value === "bigint") {
            parts.push(`${key}=${value.toString()}`)
        } else if (typeof value === "object") {
            parts.push(`${key}=${JSON.stringify(value)}`)
        } else {
            parts.push(`${key}=${value}`)
        }
    }
    return parts.length > 0 ? `[${parts.join(" ")}]` : ""
}

/**
 * Core logging function with level, context, and message.
 *
 * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
 * @param {Object} ctx - Context object with session/user ids
 * @param {string} message - Log message
 * @param {...any} args - Additional arguments
 */
function logWithContext(level, ctx, message, ...args) {
    const levelNum = LOG_LEVEL[level] || LOG_LEVEL.INFO
    if (levelNum < currentLogLevel) return

    const prefix = `${formatTimestamp()} ${level.substring(0, 3)}`
    const context = formatContext(ctx)
    const fullMessage = context ? `${prefix} ${context} ${message}` : `${prefix} ${message}`

    switch (level) {
        case "ERROR":
            console.error(fullMessage, ...args)
            break
        case "WARN":
            console.warn(fullMessage, ...args)
            break
        default:
            console.log(fullMessage, ...args)
    }
}

/**
 * Logger object with context-aware logging methods.
 * Usage: logger.info({ sid: "123", uid: 1 }, "User connected")
 */
const logger = {
    /**
     * Debug level logging.
     * @param {Object} ctx - Context with ids (sid, uid, etc.)
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     */
    debug: (ctx, message, ...args) => logWithContext("DEBUG", ctx, message, ...args),

    /**
     * Info level logging.
     * @param {Object} ctx - Context with ids (sid, uid, etc.)
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     */
    info: (ctx, message, ...args) => logWithContext("INFO", ctx, message, ...args),

    /**
     * Warning level logging.
     * @param {Object} ctx - Context with ids (sid, uid, etc.)
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     */
    warn: (ctx, message, ...args) => logWithContext("WARN", ctx, message, ...args),

    /**
     * Error level logging.
     * @param {Object} ctx - Context with ids (sid, uid, etc.)
     * @param {string} message - Log message
     * @param {...any} args - Additional arguments
     */
    error: (ctx, message, ...args) => logWithContext("ERROR", ctx, message, ...args),
}

/**
 * Creates a child logger with preset context.
 * Useful for request-scoped logging.
 *
 * @param {Object} baseCtx - Base context to include in all logs
 * @returns {Object} Logger with preset context
 */
function createLogger(baseCtx = {}) {
    return {
        debug: (ctx, message, ...args) =>
            logger.debug({ ...baseCtx, ...ctx }, message, ...args),
        info: (ctx, message, ...args) =>
            logger.info({ ...baseCtx, ...ctx }, message, ...args),
        warn: (ctx, message, ...args) =>
            logger.warn({ ...baseCtx, ...ctx }, message, ...args),
        error: (ctx, message, ...args) =>
            logger.error({ ...baseCtx, ...ctx }, message, ...args),
    }
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
    logger,
    createLogger,
    LOG_LEVEL,
}
