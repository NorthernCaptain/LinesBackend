/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

const {
    pool,
    dbLogTrainingShot,
    dbGetTrainingShotCount,
    dbFinalizeTrainingGame,
    dbGetSessionUserId,
} = require("../../db/navalclash")
const { sendMessage } = require("./messageService")
const { logger } = require("../../utils/logger")
const {
    validateWeaponPlacement,
    trackWeaponPlacement,
    trackRadarUsage,
    trackShuffleUsage,
    consumeLoserWeapons,
} = require("./weaponService")
const { submitScore } = require("./leaderboardService")
const {
    MSG,
    SESSION_STATUS,
    BONUS_TYPE,
    BASE_WIN_COINS,
    MAX_RANK_DELTA,
    VERSION,
    FIELD,
} = require("./constants")

// Rank thresholds (stars required for each rank - from UserBaseData.java)
// Paid version has 9 ranks (0-8)
const RANK_THRESHOLDS_PAID = [
    { rank: 8, stars: 50000 }, // RANK_HONORED_FLEET_ADMIRAL
    { rank: 7, stars: 3000 }, // RANK_FLEET_ADMIRAL
    { rank: 6, stars: 1000 }, // RANK_ADMIRAL
    { rank: 5, stars: 500 }, // RANK_REAR_ADMIRAL
    { rank: 4, stars: 200 }, // RANK_CAPTAIN
    { rank: 3, stars: 100 }, // RANK_COMMANDER
    { rank: 2, stars: 50 }, // RANK_LIEUTENANT_COMMANDER
    { rank: 1, stars: 10 }, // RANK_LIEUTENANT
    { rank: 0, stars: 0 }, // RANK_ENSIGN (default)
]

// Free version has 4 ranks (0-3)
const RANK_THRESHOLDS_FREE = [
    { rank: 3, stars: 250 }, // RANK_WARRANT
    { rank: 2, stars: 70 }, // RANK_MASTER_CHIEF
    { rank: 1, stars: 10 }, // RANK_PETTY_OFFICER
    { rank: 0, stars: 0 }, // RANK_SEAMAN (default)
]

// Legacy export name for backwards compatibility
const RANK_THRESHOLDS = RANK_THRESHOLDS_PAID

/**
 * Calculates rank based on total stars and app version.
 * - Paid version (v >= 2000): 9 ranks (0-8)
 * - Free version (v < 2000): 4 ranks (0-3)
 *
 * @param {number} stars - Total stars
 * @param {number} version - App version (default: paid version)
 * @returns {number} Rank
 */
function calculateRank(stars, version = VERSION.PAID_MIN) {
    const thresholds =
        version >= VERSION.PAID_MIN
            ? RANK_THRESHOLDS_PAID
            : RANK_THRESHOLDS_FREE

    for (const threshold of thresholds) {
        if (stars >= threshold.stars) {
            return threshold.rank
        }
    }
    return 0
}

/**
 * Clamps a value to a range.
 *
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
}

// Obfuscation constants (from UserBaseData.java)
const XOR_VAL1 = 0x1824ead3
const XOR_VAL2 = 0x5c83cb3d

/**
 * Encodes a value using the client's obfuscation algorithm.
 * Used for: st (stars), rk (rank), won, pld, an (coins), ls, ga[], wa[], we[], wu[]
 *
 * @param {number} origval - Original value to encode
 * @returns {number} Encoded value
 */
function val2mess(origval) {
    let val = origval < 0 ? -origval : origval
    val ^= XOR_VAL1
    val = (val << FIELD.SHIFT_VAL) >>> 0 // unsigned shift
    val ^= XOR_VAL2
    val = Math.floor(val / 3)
    val = (val << 1) >>> 0
    val |= origval < 0 ? 1 : 0
    return val
}

/**
 * Calculates coin bonus for normal win based on rank difference.
 * Formula: 9 + clamp(opponent_rank - winner_rank, -5, +5)
 *
 * @param {number} winnerRank - Winner's rank
 * @param {number} opponentRank - Opponent's rank
 * @returns {number} Coins earned (always positive, 4-14)
 */
function calculateWinBonus(winnerRank, opponentRank) {
    const rankDelta = clamp(
        opponentRank - winnerRank,
        -MAX_RANK_DELTA,
        MAX_RANK_DELTA
    )
    return BASE_WIN_COINS + rankDelta
}

/**
 * Calculates coin change based on game outcome type.
 *
 * @param {number} bonusType - One of BONUS_TYPE values
 * @param {number} winnerRank - Winner's rank (for WIN_BONUS calculation)
 * @param {number} loserRank - Loser's rank (for WIN_BONUS calculation)
 * @returns {number} Coins to add (positive) or subtract (negative)
 */
function calculateBonusCoins(bonusType, winnerRank = 0, loserRank = 0) {
    switch (bonusType) {
        case BONUS_TYPE.WIN_BONUS:
            return calculateWinBonus(winnerRank, loserRank)
        case BONUS_TYPE.LOST_BONUS:
            return -1
        case BONUS_TYPE.SURRENDER_WIN_BONUS:
            // Half of normal win bonus, minimum 1
            return Math.max(
                Math.floor(calculateWinBonus(winnerRank, loserRank) / 2),
                1
            )
        case BONUS_TYPE.SURRENDER_LOST_BONUS:
            return -2
        case BONUS_TYPE.INTERRUPT_WIN_BONUS:
            return 1
        case BONUS_TYPE.INTERRUPT_LOST_BONUS:
            return 0
        case BONUS_TYPE.LOST_BONUS_WITH_WEAPONS:
            return 2
        default:
            return 0
    }
}

/**
 * Updates user's coin balance in the database.
 * Ensures coins never go below 0.
 *
 * @param {Object} conn - Database connection
 * @param {number} userId - User ID
 * @param {number} coinsDelta - Coins to add (can be negative)
 * @param {Object} ctx - Logging context
 * @returns {Promise<number>} New coin balance
 */
async function updateUserCoins(conn, userId, coinsDelta, ctx) {
    if (!userId || coinsDelta === 0) {
        return 0
    }

    // Use GREATEST to ensure coins never go below 0
    await conn.execute(
        `UPDATE users SET coins = GREATEST(0, CAST(coins AS SIGNED) + ?) WHERE id = ?`,
        [coinsDelta, userId]
    )

    // Fetch new balance
    const [rows] = await conn.execute("SELECT coins FROM users WHERE id = ?", [
        userId,
    ])
    const newBalance = rows.length > 0 ? rows[0].coins : 0

    logger.info(
        { ...ctx, userId, coinsDelta, newBalance },
        `Updated user coins: ${coinsDelta > 0 ? "+" : ""}${coinsDelta} = ${newBalance}`
    )

    return newBalance
}

/**
 * Gets user ranks for coin calculation.
 *
 * @param {Object} conn - Database connection
 * @param {number} winnerId - Winner user ID
 * @param {number} loserId - Loser user ID
 * @returns {Promise<Object>} Object with winnerRank and loserRank
 */
async function getUserRanks(conn, winnerId, loserId) {
    const [rows] = await conn.execute(
        "SELECT id, `rank` FROM users WHERE id IN (?, ?)",
        [winnerId, loserId]
    )

    let winnerRank = 0
    let loserRank = 0

    for (const row of rows) {
        if (row.id === winnerId) winnerRank = row.rank || 0
        if (row.id === loserId) loserRank = row.rank || 0
    }

    return { winnerRank, loserRank }
}

/**
 * Builds the bonus object (bns) containing coin and star bonuses for all outcome types.
 * This is injected into fldinfo when forwarding to opponent.
 *
 * @param {number} myRank - This player's rank
 * @param {number} opponentRank - Opponent's rank
 * @returns {Object} Bonus object with type, gbc (coins), gbs (stars)
 */
function buildBonusObject(myRank, opponentRank) {
    // Calculate all bonus coins for each outcome type
    // Index mapping: 0=WIN, 1=LOST, 2=SURR_WIN, 3=SURR_LOST, 4=INT_WIN, 5=INT_LOST, 6=unused, 7=LOST_WEAPONS
    // All values must be encoded with val2mess() before sending
    const gbc = [
        val2mess(
            calculateBonusCoins(BONUS_TYPE.WIN_BONUS, myRank, opponentRank)
        ),
        val2mess(calculateBonusCoins(BONUS_TYPE.LOST_BONUS)),
        val2mess(
            calculateBonusCoins(
                BONUS_TYPE.SURRENDER_WIN_BONUS,
                myRank,
                opponentRank
            )
        ),
        val2mess(calculateBonusCoins(BONUS_TYPE.SURRENDER_LOST_BONUS)),
        val2mess(calculateBonusCoins(BONUS_TYPE.INTERRUPT_WIN_BONUS)),
        val2mess(calculateBonusCoins(BONUS_TYPE.INTERRUPT_LOST_BONUS)),
        val2mess(0), // unused
        val2mess(calculateBonusCoins(BONUS_TYPE.LOST_BONUS_WITH_WEAPONS)),
    ]

    // Stars bonuses - win gets opponent rank + 1, losers always get 0 (never negative)
    // All values must be encoded with val2mess() before sending
    const gbs = [
        val2mess(Math.max(0, opponentRank + 1)), // WIN_BONUS - stars based on opponent rank
        val2mess(0), // LOST_BONUS - no stars for losing
        val2mess(1), // SURRENDER_WIN_BONUS - minimal stars for surrender win
        val2mess(0), // SURRENDER_LOST_BONUS - no stars for surrendering
        val2mess(1), // INTERRUPT_WIN_BONUS - minimal stars for interrupt win
        val2mess(0), // INTERRUPT_LOST_BONUS - no stars for disconnect
        val2mess(0), // unused
        val2mess(0), // LOST_BONUS_WITH_WEAPONS - no stars even with weapons
    ]

    return {
        type: "bns",
        gbc,
        gbs,
    }
}

/**
 * Gets both players' info from a session for bonus calculation.
 *
 * @param {BigInt} baseSessionId - Base session ID
 * @param {number} senderPlayer - Player number of sender (0 or 1)
 * @returns {Promise<Object|null>} Object with senderRank, receiverRank, or null if not found
 */
async function getSessionPlayersInfo(baseSessionId, senderPlayer) {
    const conn = await pool.getConnection()
    try {
        const [sessions] = await conn.execute(
            `SELECT gs.user_one_id, gs.user_two_id,
                    u1.rank AS rank_one, u2.rank AS rank_two
             FROM game_sessions gs
             LEFT JOIN users u1 ON u1.id = gs.user_one_id
             LEFT JOIN users u2 ON u2.id = gs.user_two_id
             WHERE gs.id = ?`,
            [baseSessionId.toString()]
        )

        if (sessions.length === 0) {
            return null
        }

        const session = sessions[0]
        const senderRank =
            senderPlayer === 0 ? session.rank_one || 0 : session.rank_two || 0
        const receiverRank =
            senderPlayer === 0 ? session.rank_two || 0 : session.rank_one || 0

        return { senderRank, receiverRank }
    } finally {
        conn.release()
    }
}

/**
 * Builds the mdf (modify data) message with updated user info.
 *
 * @param {Object} conn - Database connection
 * @param {number} userId - User ID
 * @param {number} version - Client app version (for rank calculation)
 * @param {Object} ctx - Logging context
 * @returns {Promise<Object|null>} mdf message object or null if user not found
 */
async function buildMdfMessage(conn, userId, version, ctx) {
    if (!userId) return null

    try {
        const [rows] = await conn.execute(
            `SELECT id, name, uuid, \`rank\`, stars, games, gameswon, coins,
                    games_android, games_bluetooth, games_web, games_passplay,
                    wins_android, wins_bluetooth, wins_web, wins_passplay
             FROM users WHERE id = ?`,
            [userId]
        )

        if (rows.length === 0) {
            return null
        }

        const user = rows[0]

        // Calculate rank from stars using version-appropriate thresholds
        // Free version (v < 2000): 4 ranks
        // Paid version (v >= 2000): 9 ranks
        const stars = user.stars || 0
        const currentRank = user.rank || 0
        const newRank = calculateRank(stars, version)

        if (newRank !== currentRank) {
            await conn.execute("UPDATE users SET `rank` = ? WHERE id = ?", [
                newRank,
                userId,
            ])
            logger.info(
                {
                    ...ctx,
                    userId,
                    stars,
                    version,
                    oldRank: currentRank,
                    newRank,
                },
                `Rank updated: ${currentRank} -> ${newRank}`
            )
        }

        // Get user's weapon inventory
        // we[] = weapons owned (indices 0-5: mine, dutch, radar, shuffle, stealth, cshield)
        const [inventory] = await conn.execute(
            `SELECT item_id, quantity FROM user_inventory
             WHERE user_id = ? AND item_type = 'weapon'`,
            [userId]
        )

        // Build weapons array (indices 0-5) - PLAIN values
        const weapons = [0, 0, 0, 0, 0, 0]
        for (const inv of inventory) {
            const idx = parseInt(inv.item_id, 10)
            if (idx >= 0 && idx < 6) {
                weapons[idx] = inv.quantity
            }
        }

        // Build user object matching PlayerInfo serialization format
        // Field names match Java User.serializeJSON()
        // IMPORTANT: dev and ut are required fields - client throws exception without them
        // IMPORTANT: Only 'an' (coins) needs val2mess() encoding - other fields use
        // setter methods (setRank, setStars, etc.) that encode internally
        const userObj = {
            nam: user.name,
            dev: "", // device name - not stored per-user, empty is fine
            id: user.uuid,
            ut: 2, // user type: 1=UTYPE_ANDROID, 2=UTYPE_USER
            rk: newRank, // plain - client's setRank() encodes (use calculated rank)
            st: stars, // plain - client's setStars() encodes
            pld: user.games || 0, // plain - client's setGamesPlayed() encodes
            won: user.gameswon || 0, // plain - client's setGamesWon() encodes
            an: val2mess(user.coins || 0), // ONLY coins need encoding (direct assignment)
            ga: [
                user.games_android || 0,
                user.games_bluetooth || 0,
                user.games_web || 0,
                user.games_passplay || 0,
            ],
            wa: [
                user.wins_android || 0,
                user.wins_bluetooth || 0,
                user.wins_web || 0,
                user.wins_passplay || 0,
            ],
            we: weapons, // weapons owned - PLAIN values
            wu: [0, 0, 0, 0, 0, 0], // weapons used this game - reset to 0
        }

        return {
            type: "mdf",
            u: userObj,
        }
    } catch (error) {
        logger.error(ctx, "buildMdfMessage error:", error.message)
        return null
    }
}

/**
 * Builds the done message sent after game ends.
 *
 * @param {Object} conn - Database connection
 * @param {number} userId - User ID
 * @param {number} totalCoins - User's total coins after update
 * @param {Object} opponentWeapons - Weapons used by opponent (optional)
 * @param {number} version - Client app version (for rank calculation)
 * @param {Object} ctx - Logging context
 * @returns {Promise<Object>} done message object
 */
async function buildDoneMessage(
    conn,
    userId,
    totalCoins,
    opponentWeapons,
    version,
    ctx
) {
    const mdf = await buildMdfMessage(conn, userId, version, ctx)

    return {
        type: "done",
        cc: totalCoins,
        weap: opponentWeapons || [],
        mdf: mdf,
    }
}

/**
 * Validates session ID from request.
 * Returns full session ID and derived player/baseSessionId for DB operations.
 *
 * @param {string} sid - Session ID string
 * @param {Object} res - Express response
 * @param {Object} ctx - Logging context
 * @returns {Object|null} Session info object or null if invalid
 */
function validateSession(sid, res, ctx) {
    if (!sid) {
        logger.warn(ctx, "Request missing session ID")
        res.json({ type: "error", reason: "No session" })
        return null
    }
    const sessionId = BigInt(sid)
    if (sessionId === 0n) {
        logger.warn(ctx, "Invalid session ID: 0")
        res.json({ type: "error", reason: "Invalid session" })
        return null
    }
    return {
        sessionId,
        player: Number(sessionId % 2n),
        baseSessionId: sessionId & ~1n,
    }
}

/**
 * Sends a simple message and returns ok response.
 *
 * @param {Object} res - Express response
 * @param {BigInt} senderSessionId - Full session ID of sender
 * @param {string} msgType - Message type
 * @param {Object} body - Message body
 * @param {Object} ctx - Logging context
 * @returns {Promise<Object>} JSON response
 */
async function sendAndRespond(res, senderSessionId, msgType, body, ctx) {
    await sendMessage(senderSessionId, msgType, body)
    logger.debug(ctx, `Message ${msgType} forwarded to opponent`)
    return res.json({ type: "ok" })
}

/**
 * Greeting endpoint - sends greeting to opponent.
 * Client sends: { sid, u, v, ni }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function greeting(req, res) {
    const { sid, u, v, ni } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Greeting request")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    return sendAndRespond(res, session.sessionId, "greeting", { u, v, ni }, ctx)
}

/**
 * Field request endpoint - requests opponent's field info.
 * Client sends: { sid, lastshot }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function fieldRequest(req, res) {
    const { sid, lastshot } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Field request")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    return sendAndRespond(res, session.sessionId, "fldreq", { lastshot }, ctx)
}

/**
 * Stores field data in the database.
 *
 * @param {BigInt} baseSessionId - Base session ID (without player bit)
 * @param {number} player - Player number (0 or 1)
 * @param {Object} fieldJson - Field JSON data
 * @param {Object} ctx - Logging context
 * @returns {Promise<boolean>} True if successful
 */
async function storeFieldData(baseSessionId, player, fieldJson, ctx) {
    const conn = await pool.getConnection()
    try {
        const [sessions] = await conn.execute(
            "SELECT user_one_id, user_two_id FROM game_sessions WHERE id = ?",
            [baseSessionId.toString()]
        )

        if (sessions.length === 0) {
            logger.warn(ctx, "Session not found for field storage")
            return false
        }

        const userId =
            player === 0 ? sessions[0].user_one_id : sessions[0].user_two_id

        if (!userId) {
            // User ID might be null if opponent hasn't fully connected yet
            // Log but don't fail - the game can still proceed
            logger.warn(
                {
                    ...ctx,
                    player,
                    uid1: sessions[0].user_one_id,
                    uid2: sessions[0].user_two_id,
                },
                "User ID is null for player, skipping field storage"
            )
            return true // Return true to allow game to continue
        }

        await conn.execute(
            `INSERT INTO gamefields (session_id, player, user_id, field_json)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE field_json = VALUES(field_json)`,
            [
                baseSessionId.toString(),
                player,
                userId,
                JSON.stringify(fieldJson),
            ]
        )

        logger.debug({ ...ctx, player, userId }, "Field data stored")
        return true
    } catch (error) {
        logger.error(ctx, "storeFieldData error:", error.message)
        return false
    } finally {
        conn.release()
    }
}

/**
 * Field info endpoint - sends field info to opponent.
 * Client sends: { sid, json, player, device, uuuid, lastshot, u, whosturn, myfld, mysc, bns, rating }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function fieldInfo(req, res) {
    const {
        sid,
        json,
        player,
        device,
        uuuid,
        lastshot,
        u,
        whosturn,
        myfld,
        mysc,
        bns,
        rating,
    } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(
        {
            ...ctx,
            jsonType: typeof json,
            jsonKeys: json ? Object.keys(json) : [],
            hasShips: json?.ships ? json.ships.length : 0,
            jsonSample: json ? JSON.stringify(json).substring(0, 500) : null,
        },
        "Field info request with data"
    )

    if (!json) {
        logger.warn(ctx, "Field info missing json data")
        return res.json({ type: "error", reason: "Invalid request" })
    }

    const session = validateSession(sid, res, ctx)
    if (!session) return

    const stored = await storeFieldData(
        session.baseSessionId,
        session.player,
        json,
        ctx
    )
    if (!stored) {
        return res.json({
            type: "error",
            errcode: 5,
            reason: "Session not found",
        })
    }

    // Get both players' ranks to calculate bonus values
    const playersInfo = await getSessionPlayersInfo(
        session.baseSessionId,
        session.player
    )

    // Build bns object for the receiver (opponent)
    // The receiver's perspective: they would win against sender, so use receiver's rank as "my rank"
    let injectedBns = bns
    if (playersInfo) {
        injectedBns = buildBonusObject(
            playersInfo.receiverRank,
            playersInfo.senderRank
        )
        logger.debug(
            {
                ...ctx,
                senderRank: playersInfo.senderRank,
                receiverRank: playersInfo.receiverRank,
                gbc: injectedBns.gbc,
            },
            "Injecting bns into fldinfo"
        )
    }

    // Forward all fields with injected bns
    return sendAndRespond(
        res,
        session.sessionId,
        "fldinfo",
        {
            json,
            player,
            device,
            uuuid,
            lastshot,
            u,
            whosturn,
            myfld,
            mysc,
            bns: injectedBns,
            rating,
        },
        ctx
    )
}

/**
 * Increments move count for the player.
 *
 * @param {BigInt} baseSessionId - Base session ID
 * @param {number} player - Player number (0 or 1)
 * @param {Object} ctx - Logging context
 * @returns {Promise<void>}
 */
async function incrementMoveCount(baseSessionId, player, ctx) {
    const moveColumn = player === 0 ? "moves_one" : "moves_two"
    try {
        await pool.execute(
            `UPDATE game_sessions SET ${moveColumn} = ${moveColumn} + 1, updated_at = NOW(3)
             WHERE id = ?`,
            [baseSessionId.toString()]
        )
        logger.debug({ ...ctx, player }, "Move count incremented")
    } catch (error) {
        logger.error(ctx, "incrementMoveCount error:", error.message)
    }
}

/**
 * Shoot endpoint - fires a shot at opponent.
 * Client sends: { sid, cx, cy, time }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function shoot(req, res) {
    const { sid, cx, cy, time } = req.body
    const ctx = { reqId: req.requestId, sid, cx, cy }

    logger.debug(ctx, "Shoot request")

    if (cx === undefined || cy === undefined) {
        logger.warn(ctx, "Shoot missing coordinates")
        return res.json({ type: "error", reason: "Invalid shoot request" })
    }

    const session = validateSession(sid, res, ctx)
    if (!session) return

    await incrementMoveCount(session.baseSessionId, session.player, ctx)

    // Log shot coordinates for training data
    // Results are computed at export time using ship placements from gamefields
    const shotNumber = await dbGetTrainingShotCount(session.baseSessionId)
    const trainingData = {
        gameId: session.baseSessionId,
        shotNumber: shotNumber + 1,
        shooterPlayer: session.player + 1,
        targetX: cx,
        targetY: cy,
    }
    logger.debug(
        {
            ...ctx,
            shotNum: shotNumber + 1,
            shooter: session.player + 1,
            gameId: session.baseSessionId.toString(),
        },
        "Logging training shot"
    )
    await dbLogTrainingShot(trainingData, ctx)

    return sendAndRespond(
        res,
        session.sessionId,
        "shoot",
        { cx, cy, time },
        ctx
    )
}

/**
 * Your turn endpoint - passes turn to opponent.
 * Client sends: { sid, time }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function yourTurn(req, res) {
    const { sid, time } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Your turn request")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    return sendAndRespond(res, session.sessionId, "yourturn", { time }, ctx)
}

/**
 * Info endpoint - sends info message.
 * Client sends: { sid, msg, u }
 * Special handling for MSG.LEFT_SCREEN (player leaving/surrendering).
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function info(req, res) {
    const { sid, msg, u } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Info request: ", { msg, u })

    const session = validateSession(sid, res, ctx)
    if (!session) return

    // Check if this is a "left screen" message (player leaving/surrendering)
    const msgType = msg?.m
    if (msgType === MSG.LEFT_SCREEN) {
        return handlePlayerLeft(req, res, session, msg, u, ctx)
    }

    // Regular info message - just forward to opponent
    return sendAndRespond(res, session.sessionId, "info", { msg, u }, ctx)
}

/**
 * Handles player leaving the game (MSG.LEFT_SCREEN).
 * If waiting for opponent: terminates session.
 * If game started: opponent wins by surrender.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Object} session - Validated session info
 * @param {Object} msg - Info message
 * @param {Object} u - User info
 * @param {Object} ctx - Logging context
 * @returns {Promise<Object>} JSON response
 */
async function handlePlayerLeft(req, res, session, msg, u, ctx) {
    const conn = await pool.getConnection()
    try {
        const [sessions] = await conn.execute(
            "SELECT * FROM game_sessions WHERE id = ?",
            [session.baseSessionId.toString()]
        )

        if (sessions.length === 0) {
            logger.warn(ctx, "Session not found for player left")
            return res.json({ type: "ok" })
        }

        const gameSession = sessions[0]

        // Check if opponent is connected (user_two_id is set and status >= 1)
        const opponentConnected =
            gameSession.user_two_id && gameSession.status >= 1

        if (!opponentConnected) {
            // No opponent yet - just terminate the waiting session
            logger.info(ctx, "Player left waiting session, terminating")
            await conn.execute(
                `UPDATE game_sessions SET
                    status = ?,
                    finished_at = NOW(3)
                 WHERE id = ?`,
                [
                    SESSION_STATUS.FINISHED_TERMINATED_WAITING,
                    session.baseSessionId.toString(),
                ]
            )
            return res.json({ type: "ok" })
        }

        // Game was in progress - opponent wins by surrender
        logger.info(
            { ...ctx, player: session.player },
            "Player surrendered, opponent wins"
        )

        // Determine winner (the opponent)
        const winnerId =
            session.player === 0
                ? gameSession.user_two_id
                : gameSession.user_one_id

        await conn.execute(
            `UPDATE game_sessions SET
                status = ?,
                winner_id = ?,
                finished_at = NOW(3)
             WHERE id = ?`,
            [
                SESSION_STATUS.FINISHED_SURRENDERED,
                winnerId,
                session.baseSessionId.toString(),
            ]
        )

        // Determine loser (the player who left)
        const loserId =
            session.player === 0
                ? gameSession.user_one_id
                : gameSession.user_two_id

        // Update winner stats
        if (winnerId) {
            await conn.execute(
                `UPDATE users SET
                    games = games + 1,
                    gameswon = gameswon + 1,
                    games_web = games_web + 1,
                    wins_web = wins_web + 1,
                    stars = stars + 1
                 WHERE id = ?`,
                [winnerId]
            )
        }

        // Update loser stats
        if (loserId) {
            await conn.execute(
                `UPDATE users SET
                    games = games + 1,
                    games_web = games_web + 1
                 WHERE id = ?`,
                [loserId]
            )
        }

        // Calculate and apply surrender coins
        const { winnerRank, loserRank } = await getUserRanks(
            conn,
            winnerId,
            loserId
        )

        const winnerBonus = calculateBonusCoins(
            BONUS_TYPE.SURRENDER_WIN_BONUS,
            winnerRank,
            loserRank
        )
        const loserBonus = calculateBonusCoins(BONUS_TYPE.SURRENDER_LOST_BONUS)

        const winnerCoins = await updateUserCoins(
            conn,
            winnerId,
            winnerBonus,
            ctx
        )
        const loserCoins = await updateUserCoins(conn, loserId, loserBonus, ctx)

        logger.info(
            {
                ...ctx,
                winnerId,
                loserId,
                winnerBonus,
                loserBonus,
                winnerCoins,
                loserCoins,
            },
            `Surrender: winner +${winnerBonus}, loser ${loserBonus}`
        )

        // Forward the info message to opponent so they know the player left
        // The opponent will receive their done when they send their own /fin
        await sendMessage(session.sessionId, "info", { msg, u })

        logger.debug(ctx, "Surrender info forwarded to opponent")

        return res.json({ type: "ok" })
    } catch (error) {
        logger.error(ctx, "handlePlayerLeft error:", error.message)
        return res.json({ type: "error", reason: "Server error" })
    } finally {
        conn.release()
    }
}

/**
 * Chat endpoint - sends chat message.
 * Client sends: { sid, msg, u }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function chat(req, res) {
    const { sid, msg, u } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Chat request")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    return sendAndRespond(res, session.sessionId, "chat", { msg, u }, ctx)
}

/**
 * Determines winner and loser IDs from session.
 *
 * @param {Object} gameSession - Session object from database
 * @param {number} player - Reporting player (0 or 1)
 * @param {boolean} won - Whether reporting player won
 * @returns {Object} Object with winnerId and loserId
 */
function determineWinnerLoser(gameSession, player, won) {
    const playerOneId = gameSession.user_one_id
    const playerTwoId = gameSession.user_two_id

    if (won) {
        return {
            winnerId: player === 0 ? playerOneId : playerTwoId,
            loserId: player === 0 ? playerTwoId : playerOneId,
        }
    }
    return {
        winnerId: player === 0 ? playerTwoId : playerOneId,
        loserId: player === 0 ? playerOneId : playerTwoId,
    }
}

/**
 * Updates winner's statistics.
 * Star bonus = loserRank + 1 (same formula as in buildBonusObject)
 *
 * @param {Object} conn - Database connection
 * @param {number} winnerId - Winner user ID
 * @param {number} loserRank - Loser's rank (for star calculation)
 * @returns {Promise<void>}
 */
async function updateWinnerStats(conn, winnerId, loserRank = 0) {
    const starBonus = Math.max(1, loserRank + 1)
    await conn.execute(
        `UPDATE users SET
            games = games + 1,
            gameswon = gameswon + 1,
            games_web = games_web + 1,
            wins_web = wins_web + 1,
            stars = stars + ?
         WHERE id = ?`,
        [starBonus, winnerId]
    )
}

/**
 * Updates loser's statistics.
 *
 * @param {Object} conn - Database connection
 * @param {number} loserId - Loser user ID
 * @returns {Promise<void>}
 */
async function updateLoserStats(conn, loserId) {
    if (loserId) {
        await conn.execute(
            `UPDATE users SET
                games = games + 1,
                games_web = games_web + 1
             WHERE id = ?`,
            [loserId]
        )
    }
}

/**
 * Finish endpoint - finishes the game.
 * Client sends: { sid, won, u, sc, wpl, ni, gsi, sur }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function finish(req, res) {
    const { sid, won, u, sc, wpl, ni, gsi, sur } = req.body
    const ctx = { reqId: req.requestId, sid, won }

    logger.info(
        {
            ...ctx,
            sidType: typeof sid,
            body: JSON.stringify(req.body).substring(0, 500),
        },
        "Finish request received"
    )

    const session = validateSession(sid, res, ctx)
    if (!session) return
    const baseSessionIdStr = session.baseSessionId.toString()
    // Use BigInt for all database operations to ensure exact type match
    const sessionIdBigInt = session.baseSessionId
    const conn = await pool.getConnection()
    try {
        // Use READ COMMITTED so we see the latest status after acquiring the lock
        // With REPEATABLE READ, we might see a stale snapshot even after FOR UPDATE
        await conn.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED")
        await conn.beginTransaction()

        const [sessions] = await conn.execute(
            "SELECT * FROM game_sessions WHERE id = ? FOR UPDATE",
            [sessionIdBigInt]
        )

        logger.debug(
            { ...ctx, rowCount: sessions.length, queryId: baseSessionIdStr },
            "SELECT FOR UPDATE result"
        )

        if (sessions.length === 0) {
            await conn.rollback()
            logger.warn(ctx, "Session not found for finish")
            return res.json({
                type: "error",
                errcode: 5,
                reason: "Session not found",
            })
        }

        const gameSession = sessions[0]

        // Check if the IDs match - this helps debug type conversion issues
        const dbId = String(gameSession.id)
        const queryId = baseSessionIdStr
        const idsMatch = dbId === queryId

        logger.debug(
            {
                ...ctx,
                currentStatus: gameSession.status,
                dbSessionId: dbId,
                querySessionId: queryId,
                idsMatch,
            },
            `Finish: current session status is ${gameSession.status}`
        )

        // Determine winner/loser based on who sent the fin and whether they won
        const { winnerId, loserId } = determineWinnerLoser(
            gameSession,
            session.player,
            won
        )

        // Use query() instead of execute() to bypass prepared statement issues with BigInt
        // Also use atomic UPDATE with WHERE status <= 1 to prevent double processing
        const updateSql = `UPDATE game_sessions SET
                status = ${SESSION_STATUS.FINISHED_OK},
                winner_id = ${winnerId},
                finished_at = NOW(3)
             WHERE id = ${baseSessionIdStr} AND status <= 1`

        const [updateResult] = await conn.query(updateSql)

        logger.debug(
            {
                ...ctx,
                affectedRows: updateResult.affectedRows,
            },
            "Finish UPDATE result"
        )

        const isFirstFinish = updateResult.affectedRows > 0
        let winnerCoins = 0
        let loserCoins = 0

        if (isFirstFinish) {
            // This request "won" the race - apply stats and coins
            logger.debug(ctx, "First finish request, applying stats and coins")

            // Get ranks first - needed for star bonus and coin calculation
            const { winnerRank, loserRank } = await getUserRanks(
                conn,
                winnerId,
                loserId
            )

            // Update stats (star bonus = loserRank + 1)
            await updateWinnerStats(conn, winnerId, loserRank)
            await updateLoserStats(conn, loserId)

            // Calculate and apply coins based on ranks
            const winnerBonus = calculateBonusCoins(
                BONUS_TYPE.WIN_BONUS,
                winnerRank,
                loserRank
            )
            const loserBonus = calculateBonusCoins(BONUS_TYPE.LOST_BONUS)

            winnerCoins = await updateUserCoins(
                conn,
                winnerId,
                winnerBonus,
                ctx
            )
            loserCoins = await updateUserCoins(conn, loserId, loserBonus, ctx)

            const starBonus = Math.max(1, loserRank + 1)
            logger.info(
                {
                    ...ctx,
                    winnerId,
                    loserId,
                    winnerRank,
                    loserRank,
                    winnerBonus,
                    loserBonus,
                    winnerCoins,
                    loserCoins,
                    starBonus,
                },
                `Game finished, winner: ${winnerId}, coins: +${winnerBonus}/-${Math.abs(loserBonus)}, stars: +${starBonus}`
            )

            // Consume loser's weapons from inventory
            // Winner keeps their weapons (no consumption)
            const loserPlayer = won ? 1 - session.player : session.player
            await consumeLoserWeapons(
                session.baseSessionId,
                loserPlayer,
                conn,
                ctx
            )

            // Submit score to leaderboard if winner provided score data
            // Score is only recorded if:
            // - Player won
            // - Score > threshold (3000)
            // - Game time >= 30 seconds
            // - Not a duplicate
            if (won && sc && sc.score) {
                const scoreResult = await submitScore(
                    winnerId,
                    loserId,
                    sc.score,
                    sc.time || 0,
                    3, // game_type: 3 = web
                    gameSession.game_variant || 1,
                    winnerRank,
                    loserRank,
                    ctx
                )
                if (scoreResult.success) {
                    logger.info(
                        { ...ctx, scoreId: scoreResult.scoreId, score: sc.score },
                        "Score recorded to leaderboard"
                    )
                }
            }
        } else {
            // Another request already processed the game - just log it
            logger.debug(
                ctx,
                "Second finish request, game already processed by first request"
            )
        }

        // Build done message for the player who sent this fin request
        // done is returned directly in the HTTP response, not enqueued
        const requestingUserId =
            session.player === 0
                ? gameSession.user_one_id
                : gameSession.user_two_id
        const requestingUserVersion =
            session.player === 0
                ? gameSession.version_one
                : gameSession.version_two

        // For coins in done message: if we just updated, use the new balance
        // If already processed, fetch current balance from DB
        let requestingUserCoins
        if (isFirstFinish) {
            requestingUserCoins = won ? winnerCoins : loserCoins
        } else {
            const [userRows] = await conn.execute(
                "SELECT coins FROM users WHERE id = ?",
                [requestingUserId]
            )
            requestingUserCoins = userRows.length > 0 ? userRows[0].coins : 0
        }

        const requestingUserDone = await buildDoneMessage(
            conn,
            requestingUserId,
            requestingUserCoins,
            wpl, // opponent's weapons
            requestingUserVersion,
            ctx
        )

        await conn.commit()

        // Finalize training data after transaction commit (only for first finish)
        if (isFirstFinish) {
            dbFinalizeTrainingGame(session.baseSessionId, ctx).catch((err) => {
                logger.error(ctx, "dbFinalizeTrainingGame failed:", err.message)
            })

            // Forward the original fin message to opponent (they poll via /receive)
            await sendMessage(session.sessionId, "fin", {
                won,
                u,
                sc,
                wpl,
                ni,
                gsi,
                sur,
            })
        }

        logger.debug(ctx, "Returning done directly to fin sender")

        // Return done directly in HTTP response (not enqueued)
        return res.json(requestingUserDone)
    } catch (error) {
        await conn.rollback()
        logger.error(ctx, "finish error:", error.message)
        return res.json({ type: "error", reason: "Server error" })
    } finally {
        conn.release()
    }
}

/**
 * Dutch move endpoint - Flying Dutchman ship relocation.
 * NOT forwarded to opponent - opponent sees new position via fldinfo.
 * Just tracks the usage and returns OK.
 * Client sends: { sid, ocx, ocy, ncx, ncy, or }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function dutchMove(req, res) {
    const { sid } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Dutch move request (tracking only, not forwarded)")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    // Dutch moves don't need explicit tracking - the Dutch ship itself
    // is already tracked in weapons_tracked via wpl
    // Just return OK without forwarding to opponent
    return res.json({ type: "ok" })
}

/**
 * Ship move endpoint - shuffle weapon ship move.
 * NOT forwarded to opponent - opponent sees new position via fldinfo.
 * Tracks shuffle usage and returns OK.
 * Client sends: { sid, ship }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function shipMove(req, res) {
    const { sid } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Ship move request (tracking only, not forwarded)")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    // Track shuffle weapon usage
    await trackShuffleUsage(session.baseSessionId, session.player, ctx)

    // Return OK without forwarding to opponent
    return res.json({ type: "ok" })
}

/**
 * Weapon placement list endpoint - validates and tracks weapons.
 * NOT forwarded to opponent - just validates against inventory.
 * Weapons are consumed at game END, not here.
 * Client sends: { sid, weap: [{ type, startX, startY, ... }, ...] }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function weaponsList(req, res) {
    const { sid, weap } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug({ ...ctx, weapCount: weap?.length || 0 }, "Weapon list request")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    // Get user ID for this player
    const userId = await dbGetSessionUserId(
        session.baseSessionId,
        session.player
    )
    if (!userId) {
        logger.warn(ctx, "User ID not found for weapon validation")
        return res.json({ type: "error", reason: "User not found" })
    }

    // Validate weapons against inventory
    const validation = await validateWeaponPlacement(weap || [], userId, ctx)
    if (!validation.valid) {
        return res.json({ type: "error", reason: validation.error })
    }

    // Track weapons in session (NOT consumed yet - that happens at game end)
    const tracked = await trackWeaponPlacement(
        session.baseSessionId,
        session.player,
        validation.counts,
        ctx
    )
    if (!tracked) {
        return res.json({ type: "error", reason: "Failed to track weapons" })
    }

    logger.debug(
        { ...ctx, counts: validation.counts },
        "Weapons validated and tracked"
    )

    return res.json({ type: "ok" })
}

/**
 * Radar activation endpoint - tracks radar usage.
 * NOT forwarded to opponent - radar is client-side only.
 * Client sends: { sid, x, y }
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object>} JSON response
 */
async function radarActivation(req, res) {
    const { sid } = req.body
    const ctx = { reqId: req.requestId, sid }

    logger.debug(ctx, "Radar activation request")

    const session = validateSession(sid, res, ctx)
    if (!session) return

    // Track radar usage
    await trackRadarUsage(session.baseSessionId, session.player, ctx)

    return res.json({ type: "ok" })
}

module.exports = {
    greeting,
    fieldRequest,
    fieldInfo,
    shoot,
    yourTurn,
    info,
    chat,
    finish,
    dutchMove,
    shipMove,
    // Weapon endpoints
    weaponsList,
    radarActivation,
    // Exported for testing
    validateSession,
    storeFieldData,
    determineWinnerLoser,
    calculateWinBonus,
    calculateBonusCoins,
    clamp,
    buildBonusObject,
    calculateRank,
    // Profile data
    buildMdfMessage,
    // Obfuscation
    val2mess,
}
