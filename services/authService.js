/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */
const { validate } = require("../utils/validate.js")
const { respond } = require("../utils/respond.js")
const {
    dbHasUser,
    dbCreateUser,
    dbGetUser,
    dbCreateAccessToken,
    dbGetAccessToken,
    dbDeleteAccessToken,
    dbGetClientToken,
    dbCreateRefreshToken,
    dbGetRefreshToken,
    dbDeleteRefreshToken,
} = require("../db/auth")
const { ServerError } = require("../errors")

exports.model = {
    getClient: getClient,
    saveAccessToken: saveAccessToken,
    getUser: getUser,
    grantTypeAllowed: grantTypeAllowed,
    getAccessToken: getAccessToken,
    saveRefreshToken: saveRefreshToken,
    getRefreshToken: getRefreshToken,
    revokeRefreshToken: revokeRefreshToken,
}

function getClient(clientID, clientSecret, cbFunc) {
    const client = {
        clientID,
        clientSecret,
        grants: ["password", "refresh_token"],
        redirectUris: null,
    }
    console.log("GET CLIENT0", client)
    dbGetClientToken(clientID, clientSecret).then((rec) => {
        cbFunc(false, rec ? client : null)
    })
}

function grantTypeAllowed(clientID, grantType, cbFunc) {
    cbFunc(false, true)
}

function getUser(username, password, cbFunc) {
    dbGetUser(username, password).then((user) => {
        cbFunc(false, user)
    })
}

function saveAccessToken(accessToken, clientID, expires, user, cbFunc) {
    const userId = user.user_id || user.id
    dbCreateAccessToken(accessToken, { user_id: userId }, expires).then((id) =>
        cbFunc(false, id)
    )
}

function getAccessToken(bearerToken, cbFunc) {
    dbGetAccessToken(bearerToken).then((tokenItem) => {
        cbFunc(
            false,
            tokenItem
                ? {
                      user: {
                          user_id: tokenItem.user_id,
                      },
                      expires: tokenItem.expires_at,
                  }
                : null
        )
    })
}

/**
 * Saves a refresh token (hashed) to the database.
 * Called by node-oauth2-server after issuing a refresh token.
 *
 * @param {string} refreshToken - Raw refresh token
 * @param {string} clientId - OAuth client ID
 * @param {Date} expires - Token expiration date
 * @param {Object} user - User object with user_id
 * @param {Function} cbFunc - Callback(error, result)
 */
function saveRefreshToken(refreshToken, clientId, expires, user, cbFunc) {
    const userId = user.user_id || user.id
    dbCreateRefreshToken(refreshToken, clientId, userId, expires).then(
        (result) => cbFunc(false, result)
    )
}

/**
 * Retrieves a refresh token record for validation.
 * Called by node-oauth2-server during refresh_token grant.
 *
 * @param {string} refreshToken - Raw refresh token
 * @param {Function} cbFunc - Callback(error, tokenData)
 */
function getRefreshToken(refreshToken, cbFunc) {
    dbGetRefreshToken(refreshToken).then((tokenItem) => {
        cbFunc(
            false,
            tokenItem
                ? {
                      clientId: tokenItem.client_id,
                      userId: tokenItem.user_id,
                      expires: tokenItem.expires_at,
                  }
                : null
        )
    })
}

/**
 * Revokes a refresh token (deletes it from DB).
 * Called by node-oauth2-server to implement token rotation.
 *
 * @param {string} refreshToken - Raw refresh token to revoke
 * @param {Function} cbFunc - Callback(error, result)
 */
function revokeRefreshToken(refreshToken, cbFunc) {
    dbDeleteRefreshToken(refreshToken).then((result) => cbFunc(false, result))
}

async function registerUser(req, res) {
    let body = req.body
    validate(body, "register_user_req")
    let hasUser = await dbHasUser(body.email)
    if (hasUser) {
        throw new ServerError("111")
    }

    let userId = await dbCreateUser(body.email, body.password, body.name)
    respond({ user_id: userId }, "register_user_resp", res)
}

function loginUser(req, res) {
    console.log("login called", req)
}

/**
 * Logs out the current user by revoking their access token.
 * Extracts the bearer token from the Authorization header and deletes it.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function logoutUser(req, res) {
    const authHeader = req.get("Authorization")
    const match = /(?<=Bearer )[a-fA-F0-9]+/.exec(authHeader)
    if (!match) {
        throw new ServerError("Missing or invalid authorization token")
    }
    await dbDeleteAccessToken(match[0])
    res.json({ success: true })
}

exports.loginUser = loginUser
exports.registerUser = registerUser
exports.logoutUser = logoutUser
