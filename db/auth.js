const  crypto = require("crypto");
const  db = require('./db').authdb;

const cryptPassword = (password) => {
    return password.length > 60
        ? password
        : crypto.createHash("sha256").update(password).digest("hex");
}

const dbCreateUser = async (email, password, name) => {
    return new Promise((resolve => {
        let pwdEncrypted = cryptPassword(password);
        db.query("insert into users (email, password, name) values(?,?,?)",
            [email, pwdEncrypted, name], (error, result) => {
                let id = null;
                if(error) console.log("ERROR inserting user: ", error, email);
                if(result && result.insertId > 0) {
                    id = result.insertId
                }
                resolve(id)
            })
    }))
};

const dbGetUser = async (email, password) => {
    return new Promise((resolve => {
        let pwdEncrypted = cryptPassword(password);
        db.query("select * from users where email=? and password=?",
            [email, pwdEncrypted], (error, result) => {
                let id = null;
                if(error) console.log("ERROR selecting user: ", error, email);
                if(result && result.length) {
                    id = result[0]
                }
                resolve(id)
            })
    }))
};

const dbHasUser = async (email) => {
    return new Promise((resolve => {
        db.query("select user_id from users where email=?",
            [email], (error, result) => {
                let id = null;
                if(error) console.log("ERROR checking user: ", error, email);
                if(result && result.length) {
                    id = result[0].user_id
                }
                resolve(!!id)
            })
    }))
};

const dbCreateAccessToken = async (token, user, expires) => {
    return new Promise((resolve => {
        console.log("CREATE token: ", token, user, expires);
        db.query("insert into access_tokens (token, user_id, expires_at) values(?,?,?)",
            [token, user.user_id, expires], (error, result) => {
                let id = null;
                if(error) console.log("ERROR inserting access_token: ", error, token, user);
                if(result && result.insertId > 0) {
                    id = result.insertId
                }
                resolve(id)
            })
    }))
};

const dbGetAccessToken = async (token) => {
    return new Promise((resolve => {
        db.query("select * from access_tokens where token=?",
            [token], (error, result) => {
                let rec = null;
                if(error) console.log("ERROR getting user by token: ", error, token);
                if(result && result.length) {
                    rec = result[0]
                }
                resolve(rec)
            })
    }))
};

const dbGetClientToken = async (client, token) => {
    return new Promise((resolve => {
        db.query("select * from client_tokens where client=? and client_secret=? and is_valid=1",
            [client, token], (error, result) => {
                let rec = null;
                if(error) console.log("ERROR getting client by token: ", error, token);
                if(result && result.length) {
                    rec = result[0]
                }
                resolve(rec)
            })
    }))
};

exports.dbCreateUser = dbCreateUser;
exports.dbGetUser = dbGetUser;
exports.dbHasUser = dbHasUser;
exports.dbCreateAccessToken = dbCreateAccessToken;
exports.dbGetAccessToken = dbGetAccessToken;
exports.dbGetClientToken = dbGetClientToken;

