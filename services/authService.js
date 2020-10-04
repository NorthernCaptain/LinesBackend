const {validate} = require('../utils/validate.js')
const {respond} = require('../utils/respond.js')
const {dbHasUser, dbCreateUser, dbGetUser, dbCreateAccessToken, dbGetAccessToken, dbGetClientToken} = require('../db/auth');
const {ServerError} = require('../errors');

exports.model = {
    getClient: getClient,
    saveAccessToken: saveAccessToken,
    getUser: getUser,
    grantTypeAllowed: grantTypeAllowed,
    getAccessToken: getAccessToken,
};

function getClient(clientID, clientSecret, cbFunc) {
    const client = {
        clientID,
        clientSecret,
        grants: ["password"],
        redirectUris: null,
    };
    console.log("GET CLIENT0", client);
    dbGetClientToken(clientID, clientSecret).then(rec => {
        cbFunc(false, rec ? client : null);
    });
}

function grantTypeAllowed(clientID, grantType, cbFunc) {
    cbFunc(false, true);
}

function getUser(username, password, cbFunc) {
    dbGetUser(username, password).then((user) => {
        cbFunc(false, user);
    });
}

function saveAccessToken(accessToken, clientID, expires, user, cbFunc) {
    dbCreateAccessToken(accessToken, user, expires).then(id => cbFunc(false, id));
}

function getAccessToken(bearerToken, cbFunc) {
    dbGetAccessToken(bearerToken).then(tokenItem => {
        cbFunc(false,
            tokenItem ?
                {
                    user: {
                        user_id: tokenItem.user_id,
                    },
                    expires: tokenItem.expires_at
                } : null);
    });
}

async function registerUser(req, res) {
    let body = req.body;
    validate(body, "register_user_req");
    let hasUser = await dbHasUser(body.email);
    if(hasUser) {
        throw new ServerError("111");
    }

    let userId = await dbCreateUser(body.email, body.password, body.name);
    respond({user_id: userId},"register_user_resp", res);
}

function loginUser(req, res) {
    console.log("login called", req)
}

exports.loginUser = loginUser;
exports.registerUser = registerUser;