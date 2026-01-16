/**
 * HTTP/HTTPS server initialization and certificate management.
 */

const fs = require("fs")
const https = require("https")

const CERT_PATH = "etc/letsencrypt/live/navalclash.com/fullchain.pem"
const KEY_PATH = "etc/letsencrypt/live/navalclash.com/privkey.pem"
const HTTPS_PORT = 8443
const HTTP_PORT = 10080

let httpsServer = null
let workerId = null

/**
 * Check if SSL certificate files exist.
 * @returns {boolean}
 */
function certsExist() {
    return fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)
}

/**
 * Check if request originates from localhost.
 * @param {Object} req - Express request
 * @returns {boolean}
 */
function isFromLocalhost(req) {
    const ip = req.ip || req.connection.remoteAddress
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1"
}

/**
 * Middleware to redirect HTTP to HTTPS (skips localhost).
 */
function httpsRedirect(req, res, next) {
    if (httpsServer && !req.secure && !isFromLocalhost(req)) {
        return res.redirect(["https://", req.get("Host"), req.baseUrl].join(""))
    }
    next()
}

/**
 * Middleware that only allows requests from localhost.
 */
function localhostOnly(req, res, next) {
    if (!isFromLocalhost(req)) {
        console.warn(
            `Blocked request from non-localhost IP: ${req.ip || req.connection.remoteAddress}`
        )
        return res.status(403).json({ error: "Forbidden" })
    }
    next()
}

/**
 * Reload SSL certificates on the HTTPS server.
 * @returns {Object} Result with success flag and optional error
 */
function reloadCertificates() {
    if (!httpsServer) {
        return { success: false, error: "HTTPS server not running" }
    }

    if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
        return { success: false, error: "Certificate files not found" }
    }

    const newKey = fs.readFileSync(KEY_PATH, "utf8")
    const newCert = fs.readFileSync(CERT_PATH, "utf8")

    httpsServer.setSecureContext({
        key: newKey,
        cert: newCert,
    })

    console.log(`Worker ${workerId}: SSL certificates reloaded successfully`)
    return { success: true }
}

/**
 * Setup certificate reload message listener.
 */
function setupCertReloadListener() {
    process.on("message", (message) => {
        if (message && message.type === "reload-certs") {
            try {
                reloadCertificates()
            } catch (error) {
                console.error(
                    `Worker ${workerId}: Failed to reload certificates:`,
                    error.message
                )
            }
        }
    })
}

/**
 * Setup the certificate reload endpoint.
 * @param {Object} app - Express app
 */
function setupCertReloadEndpoint(app) {
    app.post("/update/cert", localhostOnly, (req, res) => {
        try {
            if (!certsExist()) {
                return res.status(404).json({
                    error: "Certificate files not found",
                })
            }

            // Broadcast to all workers via master (including this one)
            process.send({ type: "reload-certs" })

            return res.json({
                success: true,
                message: "SSL certificate reload triggered on all workers",
            })
        } catch (error) {
            console.error(
                `Worker ${workerId}: Failed to trigger certificate reload:`,
                error.message
            )
            return res.status(500).json({
                error: "Failed to trigger certificate reload",
                details: error.message,
            })
        }
    })
}

/**
 * Start HTTP and HTTPS servers.
 * @param {Object} app - Express app
 * @param {string} wid - Worker ID
 * @returns {Object} Object with httpServer and httpsServer
 */
function startServers(app, wid) {
    workerId = wid

    // Start HTTPS server if certs exist
    if (certsExist()) {
        const privateKey = fs.readFileSync(KEY_PATH, "utf8")
        const certificate = fs.readFileSync(CERT_PATH, "utf8")
        const credentials = { key: privateKey, cert: certificate }

        httpsServer = https.createServer(credentials, app)
        httpsServer.listen(HTTPS_PORT, "0.0.0.0", (err) => {
            if (err) {
                console.error("HTTPS SERVER ERROR: ", err)
            }
            console.log(
                `Server 1.5.0 worker ${workerId} started (HTTPS), UID is now ${process.getuid ? process.getuid() : ""}`
            )
        })
    } else {
        console.warn(
            `Warning: SSL certificates not found at ${CERT_PATH}. Starting HTTP only.`
        )
    }

    // Start HTTP server
    const httpServer = app.listen(HTTP_PORT, "0.0.0.0", (e) => {
        if (e) {
            console.error("HTTP SERVER ERROR: ", e)
        }
        console.log(
            `Server 1.5.0 worker ${workerId} started (HTTP only), UID is now ${process.getuid ? process.getuid() : ""}`
        )
    })

    // Setup cert reload listener
    setupCertReloadListener()

    return { httpServer, httpsServer }
}

module.exports = {
    isFromLocalhost,
    httpsRedirect,
    localhostOnly,
    startServers,
    setupCertReloadEndpoint,
    CERT_PATH,
    KEY_PATH,
}
