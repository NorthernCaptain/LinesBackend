const cluster = require("cluster")
const os = require("os")

const numWorkers = parseInt(process.env.CLUSTER_WORKERS, 10) || os.cpus().length

if (cluster.isMaster) {
    const { loadModules } = require("./utils/moduleLoader")

    let nextWorkerId = 1

    console.log(
        `Master process ${process.pid} starting ${numWorkers} workers...`
    )

    const forkWorker = () => {
        const workerId = nextWorkerId++
        const worker = cluster.fork({ WORKER_ID: workerId })
        worker.workerId = workerId
        console.log(`Worker ${workerId} started with PID ${worker.process.pid}`)
    }

    for (let i = 0; i < numWorkers; i++) {
        forkWorker()
    }

    // Initialize master-process hooks for dynamic modules
    const modules = loadModules()
    for (const mod of modules) {
        if (mod.setupMaster) mod.setupMaster()
    }

    cluster.on("exit", (worker, code, signal) => {
        console.log(
            `Worker ${worker.workerId} (PID ${worker.process.pid}) died with code ${code}, signal ${signal}. Restarting in 2 seconds...`
        )
        setTimeout(() => {
            forkWorker()
        }, 2000)
    })
} else {
    // Worker process
    const workerId = process.env.WORKER_ID
    console.log(`Worker ${workerId} (PID ${process.pid}) initializing...`)

    const { initValidators } = require("./utils/validate")
    const { expressErrorHandler } = require("./errors")
    const { setServers, githubPushEvent } = require("./utils/rebuild")
    const express = require("express")
    const fs = require("fs")
    const https = require("https")
    const bodyParser = require("body-parser")
    const helmet = require("helmet")
    const { wrap } = require("@awaitjs/express")
    const oAuth2Server = require("node-oauth2-server")
    const authModel = require("./services/authService").model
    const linesRouterFunc = require("./routes/lines").router
    const oldsRouterFunc = require("./routes/olds").router
    const authRouterFunc = require("./routes/auth").router
    const { loadModules } = require("./utils/moduleLoader")

    const certPath = "etc/letsencrypt/live/lines.navalclash.com"
    const hasCerts = fs.existsSync(`${certPath}/privkey.pem`)

    const app = express()
    app.oauth = oAuth2Server({
        model: authModel,
        grants: ["password"],
        debug: true,
        accessTokenLifetime: 3600 * 12,
    })

    const { requestLogger } = require("./utils/logger")

    app.use(helmet())
    app.use(requestLogger)
    // Redirect HTTP to HTTPS (only when certs are available)
    if (hasCerts) {
        app.use(function (req, res, next) {
            if (!req.secure) {
                return res.redirect(
                    ["https://", req.get("Host"), req.baseUrl].join("")
                )
            }
            next()
        })
    }

    app.use(bodyParser.urlencoded({ extended: true }))
    app.use(bodyParser.json())
    app.use(bodyParser.text())
    app.use(bodyParser.urlencoded({ extended: true }))
    // Virtual host static file serving
    app.use((req, res, next) => {
        const host = req.hostname
        let staticPath = "public" // default

        if (host === "wormit.navalclash.com") {
            staticPath = "public/wormit"
        } else if (host === "quadronia.navalclash.com") {
            staticPath = "public/quadronia"
        } else if (host === "ncbox.navalclash.com") {
            staticPath = "public/ncbox"
        } else if (host === "xnc.navalclash.com") {
            staticPath = "public/xnc"
        } else if (host === "navalclash.com" || host === "www.navalclash.com") {
            staticPath = "public/navalclash"
        }

        express.static(staticPath)(req, res, next)
    })
    app.use(app.oauth.errorHandler())
    app.use("/oldsdb", oldsRouterFunc(app))
    app.use("/", linesRouterFunc(app))
    app.use("/auth", authRouterFunc(app))

    // Mount dynamic modules
    const modules = loadModules()
    for (const mod of modules) {
        app.use(mod.mountPath, mod.createRouter(app))
    }

    app.post("/update/on/push", wrap(githubPushEvent))

    app.use(expressErrorHandler)

    initValidators()

    const httpPort = process.env.HTTP_PORT || 10080
    const httpServer = app.listen(httpPort, "0.0.0.0", () => {
        console.log(
            `Server 1.5.0 worker ${workerId} HTTP on :${httpPort}, UID is now ${process.getuid ? process.getuid() : ""}`
        )
    })

    let httpsServer = null
    if (hasCerts) {
        const credentials = {
            key: fs.readFileSync(`${certPath}/privkey.pem`, "utf8"),
            cert: fs.readFileSync(`${certPath}/fullchain.pem`, "utf8"),
        }
        const httpsPort = process.env.HTTPS_PORT || 8443
        httpsServer = https.createServer(credentials, app)
        httpsServer.listen(httpsPort, "0.0.0.0", () => {
            console.log(`Server 1.5.0 worker ${workerId} HTTPS on :${httpsPort}`)
        })
    } else {
        console.log("No SSL certs found, running HTTP only")
    }

    setServers(httpsServer ? [httpServer, httpsServer] : [httpServer])
}
