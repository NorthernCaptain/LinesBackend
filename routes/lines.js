const express = require("express")
const { wrap } = require("@awaitjs/express")

const {
    newSession,
    updateSession,
    finishSession,
    topGameScores,
} = require("../services/linesService")

const router = express.Router()

const setup = (app) => {
    // request: curl -X POST http://localhost:10080/session -H "Content-Type: application/json" -d '{"version":"0.5.1"}'
    // response: {"success":true,"data":{"uuid":"7b8c44e7-432b-47ef-afd4-e455169b54f9","ip":"127.0.0.1","version":"0.5.1","id":1}}
    router.post("/session", wrap(newSession))

    //request: curl -X POST http://localhost:10080/session/update -H "Content-Type: application/json" -d '{"version":"0.5.1","uuid":"5cc0b960-47fb-47de-b4e1-80ce6c244f3c","score":25, "level": 1, "mode": "easy"}'
    //response: {"success":true,"data":{"uuid":"5cc0b960-47fb-47de-b4e1-80ce6c244f3c","ip":"127.0.0.1","score":25}}
    router.post("/session/update", wrap(updateSession))

    //request: curl -X POST http://localhost:10080/session/finish -H "Content-Type: application/json" -d '{"version":"0.5.1","uuid":"5cc0b960-47fb-47de-b4e1-80ce6c244f3c","score":25, "level": 1, "mode": "easy", "user":"Leo"}'
    //response: {"success":true,"data":{"uuid":"5cc0b960-47fb-47de-b4e1-80ce6c244f3c","ip":"127.0.0.1","score":25,"level":1,"mode":"easy","user":"Leo","done":1,"id":3}}
    router.post("/session/finish", wrap(finishSession))

    //request: curl -X POST http://localhost:10080/scores/top -H "Content-Type: application/json" -d '{"version":"0.5.1","mode":"easy","limit":25}'
    //response: {"success":true,"data":[{"num":1,"id":5,"user_name":"Leo2","score":83,"date_created":"2020-05-23T01:34:25.000Z","level":3,"seconds_played":3771,"game_type":"easy","session_id":2},{"num":2,"id":4,"user_name":"Leo","score":53,"date_created":"2020-05-23T01:31:44.000Z","level":2,"seconds_played":-3610,"game_type":"easy","session_id":2},{"num":3,"id":6,"user_name":"Leo3","score":43,"date_created":"2020-05-23T01:51:12.000Z","level":3,"seconds_played":4778,"game_type":"easy","session_id":2}]}
    router.post("/scores/top", wrap(topGameScores))

    return router
}

exports.router = setup
