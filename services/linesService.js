const { v4: uuid } = require("uuid")
const { validate } = require("../utils/validate.js")
const { respond } = require("../utils/respond.js")

const {
    dbGetGameSession,
    dbCreateGameScores,
    dbUpdateGameScores,
    dbLowestRankGameScore,
    dbPreliminaryRankGameScore,
    dbTopGameScores,
    dbRankGameScore,
    dbUpdateGameSession,
    dbCreateGameSession,
} = require("../db/lines")

const newSession = async (req, res) => {
    let body = req.body
    validate(body, "session_new_req")

    let session = {
        uuid: uuid(),
        ip: req.connection.remoteAddress,
        version: body.version,
    }

    session = await dbCreateGameSession(session)
    respond(session, "session_new_resp", res)
}

const updateSession = async (req, res) => {
    let body = req.body
    validate(body, "session_update_req")

    let session = {
        uuid: body.uuid,
        ip: req.connection.remoteAddress,
        score: body.score,
        level: body.level ? body.level : 0,
        mode: body.mode,
    }

    session = await dbUpdateGameSession(session)

    //user was passed, let's update scores
    if (body.user) {
        let dbsession = await dbGetGameSession(session)
        //save scores only if we played a little bit (have 6 or more pings)
        if (dbsession && dbsession.pings > 5) {
            session.user = body.user
            session = await dbUpdateGameScores(session)
            if (!session.updated) {
                session = await dbCreateGameScores(session)
            }
        }
    }

    session = await dbPreliminaryRankGameScore(session)
    if (!session.rank) {
        session = await dbLowestRankGameScore(session)
    }

    respond(session, "session_update_resp", res)
}

const finishSession = async (req, res, next) => {
    let body = req.body
    validate(body, "session_finish_req")

    let session = {
        uuid: body.uuid,
        ip: req.connection.remoteAddress,
        score: body.score,
        level: body.level,
        mode: body.mode,
        user: body.user,
        done: 1,
    }

    session = await dbUpdateGameSession(session)
    session = await dbUpdateGameScores(session)
    if (!session.updated) {
        session = await dbCreateGameScores(session)
    }
    session = await dbRankGameScore(session)
    respond(session, "session_finish_resp", res)
}

const topGameScores = async (req, res) => {
    let body = req.body
    validate(body, "top_scores_req")

    let session = {
        mode: body.mode,
        limit: Math.min(Math.max(body.limit, 3), 100),
    }

    session = await dbTopGameScores(session)
    respond(session, "top_scores_resp", res)
}

exports.newSession = newSession
exports.updateSession = updateSession
exports.finishSession = finishSession
exports.topGameScores = topGameScores
