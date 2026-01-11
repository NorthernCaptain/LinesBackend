const cluster = require("cluster")
const os = require("os")

const numWorkers = parseInt(process.env.CLUSTER_WORKERS, 10) || os.cpus().length

if (cluster.isMaster) {
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
    const navalclashRouterFunc = require("./routes/navalclash").router

    const app = express()
    app.oauth = oAuth2Server({
        model: authModel,
        grants: ["password"],
        debug: true,
        accessTokenLifetime: 3600 * 12,
    })

    const certPath = "etc/letsencrypt/live/lines.navalclash.com/fullchain.pem"
    const keyPath = "etc/letsencrypt/live/lines.navalclash.com/privkey.pem"
    const certsExist = fs.existsSync(certPath) && fs.existsSync(keyPath)

    app.use(helmet())
    app.use(requestLogger)
    //redirect all http traffic to https (only if certs exist)
    if (certsExist) {
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
    app.use("/naval/clash/api/v5", navalclashRouterFunc(app))

    app.post("/update/on/push", wrap(githubPushEvent))

    app.use(expressErrorHandler)

    initValidators()

    let httpsServer = null
    if (certsExist) {
        const privateKey = fs.readFileSync(keyPath, "utf8")
        const certificate = fs.readFileSync(certPath, "utf8")
        const credentials = { key: privateKey, cert: certificate }

        httpsServer = https.createServer(credentials, app)
        httpsServer.listen(8443, "0.0.0.0", (err) => {
            if (err) {
                console.error("ERROR: ", err)
            }
            console.log(
                `Server 1.5.0 worker ${workerId} started (HTTPS), UID is now ${process.getuid ? process.getuid() : ""}`
            )
        })
    } else {
        console.warn(
            `Warning: SSL certificates not found at ${certPath}. Starting HTTP only.`
        )
    }

    const httpServer = app.listen(10080, "0.0.0.0", () => {
        if (!certsExist) {
            console.log(
                `Server 1.5.0 worker ${workerId} started (HTTP only), UID is now ${process.getuid ? process.getuid() : ""}`
            )
        }
    })

    setServers(httpsServer ? [httpServer, httpsServer] : [httpServer])
}
