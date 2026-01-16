const crypto = require("crypto")
const db = require("./db").authdb

const dbCreateUser = async (email, password, name) => {
    try {
        const pwdEncrypted = crypto
            .createHash("sha256")
            .update(password)
            .digest("hex")
        const [result] = await db.query(
            "insert into users (email, password, name) values(?,?,?)",
            [email, pwdEncrypted, name]
        )
        return result.insertId > 0 ? result.insertId : null
    } catch (error) {
        console.log("ERROR inserting user: ", error, email)
        return null
    }
}

const dbGetUser = async (email, password) => {
    try {
        const pwdEncrypted = crypto
            .createHash("sha256")
            .update(password)
            .digest("hex")
        const [rows] = await db.query(
            "select * from users where email=? and password=?",
            [email, pwdEncrypted]
        )
        return rows.length ? rows[0] : null
    } catch (error) {
        console.log("ERROR selecting user: ", error, email)
        return null
    }
}

const dbHasUser = async (email) => {
    try {
        const [rows] = await db.query(
            "select user_id from users where email=?",
            [email]
        )
        const id = rows.length ? rows[0].user_id : null
        return !!id
    } catch (error) {
        console.log("ERROR checking user: ", error, email)
        return false
    }
}

const dbCreateAccessToken = async (token, user, expires) => {
    try {
        console.log("CREATE token: ", token, user, expires)
        const [result] = await db.query(
            "insert into access_tokens (token, user_id, expires_at) values(?,?,?)",
            [token, user.user_id, expires]
        )
        return result.insertId > 0 ? result.insertId : null
    } catch (error) {
        console.log("ERROR inserting access_token: ", error, token, user)
        return null
    }
}

const dbGetAccessToken = async (token) => {
    try {
        const [rows] = await db.query(
            "select * from access_tokens where token=?",
            [token]
        )
        return rows.length ? rows[0] : null
    } catch (error) {
        console.log("ERROR getting user by token: ", error, token)
        return null
    }
}

const dbGetClientToken = async (client, token) => {
    try {
        const [rows] = await db.query(
            "select * from client_tokens where client=? and client_secret=? and is_valid=1",
            [client, token]
        )
        return rows.length ? rows[0] : null
    } catch (error) {
        console.log("ERROR getting client by token: ", error, token)
        return null
    }
}

exports.dbCreateUser = dbCreateUser
exports.dbGetUser = dbGetUser
exports.dbHasUser = dbHasUser
exports.dbCreateAccessToken = dbCreateAccessToken
exports.dbGetAccessToken = dbGetAccessToken
exports.dbGetClientToken = dbGetClientToken
