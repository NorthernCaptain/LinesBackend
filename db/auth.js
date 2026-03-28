/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */
const crypto = require("crypto")
const bcrypt = require("bcrypt")
const db = require("./db").authdb

const BCRYPT_ROUNDS = 12
const SHA256_HEX_LENGTH = 64

/**
 * Checks if a stored password hash is a legacy SHA256 hex string.
 *
 * @param {string} hash - The stored password hash
 * @returns {boolean} True if the hash is a 64-char hex string (SHA256)
 */
function isLegacySha256(hash) {
    return hash.length === SHA256_HEX_LENGTH && /^[a-f0-9]+$/.test(hash)
}

/**
 * Computes a SHA256 hex digest of the given password (legacy format).
 *
 * @param {string} password - The plaintext password
 * @returns {string} SHA256 hex digest
 */
function sha256Hash(password) {
    return crypto.createHash("sha256").update(password).digest("hex")
}

/**
 * Creates a new user with a bcrypt-hashed password.
 *
 * @param {string} email - User email
 * @param {string} password - Plaintext password
 * @param {string} name - User display name
 * @returns {Promise<number|null>} Inserted user ID or null on error
 */
const dbCreateUser = async (email, password, name) => {
    try {
        const pwdEncrypted = await bcrypt.hash(password, BCRYPT_ROUNDS)
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

/**
 * Authenticates a user by email and password.
 * Supports both bcrypt and legacy SHA256 hashes.
 * Automatically migrates SHA256 hashes to bcrypt on successful login.
 *
 * @param {string} email - User email
 * @param {string} password - Plaintext password
 * @returns {Promise<Object|null>} User object or null if not found/wrong password
 */
const dbGetUser = async (email, password) => {
    try {
        const [rows] = await db.query("select * from users where email=?", [
            email,
        ])
        if (!rows.length) return null

        const user = rows[0]

        if (isLegacySha256(user.password)) {
            if (sha256Hash(password) !== user.password) return null
            await dbUpdatePassword(user.user_id, password)
        } else {
            const match = await bcrypt.compare(password, user.password)
            if (!match) return null
        }

        return user
    } catch (error) {
        console.log("ERROR selecting user: ", error, email)
        return null
    }
}

/**
 * Migrates a user's password from SHA256 to bcrypt.
 *
 * @param {number} userId - User ID
 * @param {string} plainPassword - Plaintext password to re-hash with bcrypt
 * @returns {Promise<boolean>} True on success, false on error
 */
const dbUpdatePassword = async (userId, plainPassword) => {
    try {
        const bcryptHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS)
        await db.query("update users set password=? where user_id=?", [
            bcryptHash,
            userId,
        ])
        return true
    } catch (error) {
        console.log("ERROR migrating password for user: ", error, userId)
        return false
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

/**
 * Computes a SHA256 hex digest of an access token for secure storage.
 * SHA256 is appropriate here (unlike passwords) because tokens are
 * high-entropy random strings that resist brute-force.
 *
 * @param {string} token - The raw access token
 * @returns {string} SHA256 hex digest
 */
function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex")
}

/**
 * Stores an access token (hashed) in the database.
 *
 * @param {string} token - Raw access token
 * @param {Object} user - User object with user_id
 * @param {Date} expires - Token expiration date
 * @returns {Promise<number|null>} Inserted row ID or null on error
 */
const dbCreateAccessToken = async (token, user, expires) => {
    try {
        const tokenHash = hashToken(token)
        const [result] = await db.query(
            "insert into access_tokens (token, user_id, expires_at) values(?,?,?)",
            [tokenHash, user.user_id, expires]
        )
        return result.insertId > 0 ? result.insertId : null
    } catch (error) {
        console.log("ERROR inserting access_token: ", error)
        return null
    }
}

/**
 * Retrieves an access token record by hashing the raw token and looking up.
 *
 * @param {string} token - Raw access token (bearer value)
 * @returns {Promise<Object|null>} Token record or null
 */
const dbGetAccessToken = async (token) => {
    try {
        const tokenHash = hashToken(token)
        const [rows] = await db.query(
            "select * from access_tokens where token=?",
            [tokenHash]
        )
        return rows.length ? rows[0] : null
    } catch (error) {
        console.log("ERROR getting user by token: ", error)
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

/**
 * Deletes an access token from the database.
 *
 * @param {string} token - The access token to delete
 * @returns {Promise<boolean|null>} True on success, null on error
 */
const dbDeleteAccessToken = async (token) => {
    try {
        const tokenHash = hashToken(token)
        await db.query("delete from access_tokens where token=?", [tokenHash])
        return true
    } catch (error) {
        console.log("ERROR deleting access_token: ", error)
        return null
    }
}

/**
 * Stores a hashed refresh token in the database.
 *
 * @param {string} token - Raw refresh token (will be hashed)
 * @param {string} clientId - OAuth client ID
 * @param {number} userId - User ID
 * @param {Date} expires - Token expiration date
 * @returns {Promise<boolean|null>} True on success, null on error
 */
const dbCreateRefreshToken = async (token, clientId, userId, expires) => {
    try {
        const tokenHash = hashToken(token)
        await db.query(
            "insert into refresh_tokens (token, client_id, user_id, expires_at) values(?,?,?,?)",
            [tokenHash, clientId, userId, expires]
        )
        return true
    } catch (error) {
        console.log("ERROR inserting refresh_token: ", error)
        return null
    }
}

/**
 * Retrieves a refresh token record by hashing the raw token.
 *
 * @param {string} token - Raw refresh token
 * @returns {Promise<Object|null>} Token record with client_id, user_id, expires_at or null
 */
const dbGetRefreshToken = async (token) => {
    try {
        const tokenHash = hashToken(token)
        const [rows] = await db.query(
            "select * from refresh_tokens where token=?",
            [tokenHash]
        )
        return rows.length ? rows[0] : null
    } catch (error) {
        console.log("ERROR getting refresh_token: ", error)
        return null
    }
}

/**
 * Deletes a refresh token (used during token rotation).
 *
 * @param {string} token - Raw refresh token to revoke
 * @returns {Promise<boolean|null>} True on success, null on error
 */
const dbDeleteRefreshToken = async (token) => {
    try {
        const tokenHash = hashToken(token)
        await db.query("delete from refresh_tokens where token=?", [tokenHash])
        return true
    } catch (error) {
        console.log("ERROR deleting refresh_token: ", error)
        return null
    }
}

exports.dbCreateUser = dbCreateUser
exports.dbGetUser = dbGetUser
exports.dbHasUser = dbHasUser
exports.dbCreateAccessToken = dbCreateAccessToken
exports.dbGetAccessToken = dbGetAccessToken
exports.dbDeleteAccessToken = dbDeleteAccessToken
exports.dbGetClientToken = dbGetClientToken
exports.dbCreateRefreshToken = dbCreateRefreshToken
exports.dbGetRefreshToken = dbGetRefreshToken
exports.dbDeleteRefreshToken = dbDeleteRefreshToken
exports.hashToken = hashToken
