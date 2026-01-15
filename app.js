const cluster = require("cluster")
const os = require("os")

const numWorkers = parseInt(process.env.CLUSTER_WORKERS, 10) || os.cpus().length

if (cluster.isMaster) {
    const { setupMasterBroker } = require("./services/navalclash/clusterBroker")

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

    // Setup Naval Clash cluster broker for message passing
    setupMasterBroker()

    // Handle cert reload broadcast from workers
    cluster.on("message", (worker, message) => {
        if (message && message.type === "reload-certs") {
            console.log(
                `Master: Broadcasting cert reload to all ${Object.keys(cluster.workers).length} workers`
            )
            // Broadcast to all workers
            for (const id in cluster.workers) {
                cluster.workers[id].send({ type: "reload-certs" })
            }
        }
    })

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
    const { requestLogger } = require("./utils/logger")
    const {
        httpsRedirect,
        startServers,
        setupCertReloadEndpoint,
    } = require("./utils/http-servers")
    const express = require("express")
    const bodyParser = require("body-parser")
    const helmet = require("helmet")
    const { wrap } = require("@awaitjs/express")
    const oAuth2Server = require("node-oauth2-server")
    const authModel = require("./services/authService").model
    const linesRouterFunc = require("./routes/lines").router
    const oldsRouterFunc = require("./routes/olds").router
    const authRouterFunc = require("./routes/auth").router
    const navalclashRouterFunc = require("./routes/navalclash").router

    const app = express()
    app.oauth = oAuth2Server({
        model: authModel,
        grants: ["password"],
        debug: true,
        accessTokenLifetime: 3600 * 12,
    })

    app.use(helmet())
    app.use(requestLogger)

    // Redirect HTTP to HTTPS (skip localhost)
    app.use(httpsRedirect)

    app.use(bodyParser.urlencoded({ extended: true }))
    app.use(bodyParser.json())
    app.use(bodyParser.text())

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
    app.use("/naval/clash/api/v5", navalclashRouterFunc(app))

    app.post("/update/on/push", wrap(githubPushEvent))
    setupCertReloadEndpoint(app)

    app.use(expressErrorHandler)

    initValidators()

    const { httpServer, httpsServer } = startServers(app, workerId)
    setServers(httpsServer ? [httpServer, httpsServer] : [httpServer])
}
