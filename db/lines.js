const db = require('./db').linesdb;

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
        db.query("update game_session set pings=pings+1, date_updated=current_timestamp, score=?, is_finished=?, level=? where uuid=?",
            [session.score, session.done ? 1 : 0, session.level, session.uuid], (error, result) => {
                if(error) console.log("ERROR updating game session: ", error, session);
                resolve(session)
            })
    }))
}

const dbGetGameSession = (session) => {
    return new Promise((resolve => {
        db.query("select * from game_session where uuid=?",
            [session.uuid], (error, result) => {
                if(error) console.log("ERROR updating game session: ", error, session);
                resolve(result ? result[0] : result)
            })
    }))
}

const dbUpdateGameScores = (session) => {
    return new Promise((resolve => {
        db.query(`
        update game_scores join game_session on game_session.id = game_scores.session_id 
        set game_scores.user_name=?, game_scores.score=?, game_scores.level=?, game_scores.game_type=?, 
        game_scores.seconds_played=TIMESTAMPDIFF(SECOND, game_session.date_created, game_session.date_updated) 
        where game_session.uuid = ?
        `,
            [session.user, session.score, session.level, session.mode, session.uuid], (error, result) => {
                if(error) console.log("ERROR updating game score: ", error, session);
                session.updated = result.affectedRows
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
                    game_scores.*, game_session.uuid
                    from game_scores join game_session on game_scores.session_id=game_session.id,
                    (SELECT @row_number := 0) AS row
                    where game_scores.game_type = ?
                    order by score desc, id desc
                    ) scores
                  where scores.uuid = ?
            `,
            [session.mode, session.uuid], (error, result) => {
                if(error) console.log("ERROR selecting game score rank: ", error, session);
                if(result && result.length) {
                    session.rank = result[0].rank
                }
                resolve(session)
            })
    }))
}

const dbLowestRankGameScore = (session) => {
    return new Promise((resolve => {
        db.query(`select count(*)+1 as rank
                    from game_scores
                    where game_scores.game_type = ?
            `,
            [session.mode], (error, result) => {
                if(error) console.log("ERROR selecting lowest game score rank: ", error, session);
                if(result && result.length) {
                    session.rank = result[0].rank
                }
                resolve(session)
            })
    }))
}


const dbPreliminaryRankGameScore = (session) => {
    return new Promise((resolve => {
        db.query(`select min(num) rank from (
                    select (@row_number := @row_number + 1) AS num,
                    game_scores.*
                    from game_scores,
                    (SELECT @row_number := 0) AS row
                    where game_scores.game_type = ?
                    order by score desc, id desc
                    ) scores
                  where scores.score<= ?
            `,
            [session.mode, session.score], (error, result) => {
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
                        game_scores.score,
                        game_scores.user_name,
                        game_scores.level,
                        game_scores.game_type as mode
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

exports.dbGetGameSession = dbGetGameSession
exports.dbCreateGameScores = dbCreateGameScores
exports.dbUpdateGameScores = dbUpdateGameScores
exports.dbLowestRankGameScore = dbLowestRankGameScore
exports.dbPreliminaryRankGameScore = dbPreliminaryRankGameScore
exports.dbTopGameScores = dbTopGameScores;
exports.dbRankGameScore = dbRankGameScore;
exports.dbUpdateGameSession = dbUpdateGameSession;
exports.dbCreateGameSession = dbCreateGameSession;
