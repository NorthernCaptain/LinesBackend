const { v4: uuid } = require('uuid');
const mysql = require('mysql');

const db = mysql.createPool({
    connectionLimit: 10,
    host: process.env[`db_host`],
    database: process.env[`db_database`],
    user: process.env[`db_user`],
    password: process.env[`db_password`],
    timezone: 'Z'
});

const dbCreateGameSession = (session) => {
    return new Promise((resolve => {
        db.query("insert into game_session (uuid, ip, game_version) values(?,?,?)",
            [session.uuid, session.ip, session.version], (error, result) => {
                if(error) console.log("ERROR inserting game session: ", error, session);
                if(result && result.insertId > 0) {
                    session.id = result.insertId
                }
                resolve(session)
            })
    }))
}

const dbUpdateGameSession = (session) => {
    return new Promise((resolve => {
        db.query("update game_session set pings=pings+1, date_updated=current_timestamp, score=?, is_finished=? where uuid=?",
            [session.score, session.done ? 1 : 0, session.uuid], (error, result) => {
                if(error) console.log("ERROR updating game session: ", error, session);
                resolve(session)
            })
    }))
}

const dbCreateGameScores = (session) => {
    return new Promise((resolve => {
        db.query(`
        insert into game_scores (user_name, score, level, game_type, session_id, seconds_played) 
        select ?, ?, ?, ?, game_session.id, TIMESTAMPDIFF(SECOND, game_session.date_created, game_session.date_updated)
        from game_session where game_session.uuid = ?
        `,
            [session.user, session.score, session.level, session.mode, session.uuid], (error, result) => {
                if(error) console.log("ERROR inserting game score: ", error, session);
                if(result && result.insertId > 0) {
                    session.id = result.insertId
                }
                resolve(session)
            })
    }))
}

const dbRankGameScore = (session) => {
    return new Promise((resolve => {
        db.query(`select min(num) rank from (
                    select (@row_number := @row_number + 1) AS num,
                    game_scores.*
                    from game_scores,
                    (SELECT @row_number := 0) AS row
                    where game_scores.game_type = ?
                    order by score desc, id desc
                    ) scores
                  where scores.id = ?
            `,
            [session.mode, session.id], (error, result) => {
                if(error) console.log("ERROR selecting game score rank: ", error, session);
                if(result && result.length) {
                    session.rank = result[0].rank
                }
                resolve(session)
            })
    }))
}

const dbTopGameScores = (session) => {
    return new Promise((resolve => {
        db.query(`
                    select (@row_number := @row_number + 1) AS num,
                    game_scores.*
                    from game_scores,
                    (SELECT @row_number := 0) AS row
                    where game_scores.game_type = ?
                    order by score desc, id desc
                    limit ?
            `,
            [session.mode, session.limit], (error, result) => {
                if(error) console.log("ERROR selecting top game scores ", error, session);
                resolve(result ? result : [])
            })
    }))
}



const newSession = (req, res, next) => {
    let body = req.body;
    if(!body || !body.version) {
        res.sendStatus(400);
        return;
    }

    let session = {
        uuid: uuid(),
        ip: req.connection.remoteAddress,
        version: body.version
    };

    dbCreateGameSession(session).then(sess => {
        res.send(JSON.stringify(
            {
                success: true,
                data: sess
            }));
        }
    );
};

const updateSession = (req, res, next) => {
    let body = req.body;
    if(!body || !body.uuid || !body.score) {
        res.sendStatus(400);
        return;
    }

    let session = {
        uuid: body.uuid,
        ip: req.connection.remoteAddress,
        score: body.score
    };

    dbUpdateGameSession(session).then(sess => {
            res.send(JSON.stringify(
                {
                    success: true,
                    data: sess
                }));
        }
    );
};

const finishSession = (req, res, next) => {
    let body = req.body;
    if(!body || !body.uuid
        || !body.score
        || !body.level
        || !body.mode
        || !body.user
    ) {
        res.sendStatus(400);
        return;
    }

    let session = {
        uuid: body.uuid,
        ip: req.connection.remoteAddress,
        score: body.score,
        level: body.level,
        mode: body.mode,
        user: body.user,
        done: 1
    };

    dbUpdateGameSession(session)
        .then(sess => {
            return dbCreateGameScores(sess)
        })
        .then(sess => {
            return dbRankGameScore(sess)
        })
        .then(sess => {
            res.send(JSON.stringify(
                {
                    success: true,
                    data: sess
                }));
        }
    );
};

const topGameScores = (req, res, next) => {
    let body = req.body;
    if(!body || !body.mode || !body.version || !body.limit) {
        res.sendStatus(400);
        return;
    }

    let session = {
        mode: body.mode,
        limit: Math.min(Math.max(body.limit, 3), 100)
    };

    dbTopGameScores(session).then(sess => {
            res.send(JSON.stringify(
                {
                    success: true,
                    data: sess
                }));
        }
    );
};


exports.newSession = newSession;
exports.updateSession = updateSession;
exports.finishSession = finishSession;
exports.topGameScores = topGameScores;