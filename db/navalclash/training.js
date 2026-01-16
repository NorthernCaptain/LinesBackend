/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 *
 * Training data collection for AI model training.
 * Logs ship placements and shot results during gameplay.
 */

const { pool } = require("./pool")
const { logger } = require("../../utils/logger")

/**
 * Stores ship placements temporarily for a game session.
 * Called when a player sends their field info.
 * The data is stored in gamefields table (already exists).
 * Final training game record is created when game finishes.
 *
 * Note: This function doesn't need to do anything special since
 * ship placements are already stored in gamefields table by storeFieldData().
 * We'll extract from there when finalizing the training game record.
 */

/**
 * Logs a shot for training data collection.
 * Only stores coordinates - results are computed at export time
 * using ship placement data from gamefields table.
 *
 * Note: The game protocol is peer-to-peer; shot results are
 * determined client-side and never sent to the server.
 *
 * @param {Object} data - Shot data
 * @param {bigint|string} data.gameId - Base session ID (game_sessions.id)
 * @param {number} data.shotNumber - Sequential shot number in game
 * @param {number} data.shooterPlayer - Player who made the shot (1 or 2)
 * @param {number} data.targetX - X coordinate (0-9)
 * @param {number} data.targetY - Y coordinate (0-9)
 * @param {Object} ctx - Logging context
 * @returns {Promise<boolean>} Success status
 */
async function dbLogTrainingShot(data, ctx) {
    try {
        await pool.execute(
            `INSERT INTO nc_training_shots
             (game_id, shot_number, shooter_player, target_x, target_y)
             VALUES (?, ?, ?, ?, ?)`,
            [
                data.gameId.toString(),
                data.shotNumber,
                data.shooterPlayer,
                data.targetX,
                data.targetY,
            ]
        )
        logger.debug(
            { ...ctx, shotNum: data.shotNumber, x: data.targetX, y: data.targetY },
            "Training shot logged"
        )
        return true
    } catch (error) {
        logger.error(ctx, "dbLogTrainingShot error:", error.message)
        return false
    }
}

/**
 * Gets the current shot count for a game session.
 * Used to determine the shot_number for new shots.
 *
 * @param {bigint|string} gameId - Base session ID
 * @returns {Promise<number>} Current shot count (0 if none)
 */
async function dbGetTrainingShotCount(gameId) {
    try {
        const [rows] = await pool.execute(
            `SELECT COUNT(*) as count FROM nc_training_shots WHERE game_id = ?`,
            [gameId.toString()]
        )
        return rows[0].count
    } catch (error) {
        logger.error({}, "dbGetTrainingShotCount error:", error.message)
        return 0
    }
}

/**
 * Gets all cells occupied by a ship.
 *
 * @param {Object} ship - Ship object {size, x, y, horizontal}
 * @returns {Array} Array of {x, y} coordinates
 */
function getShipCells(ship) {
    const cells = []
    for (let i = 0; i < ship.size; i++) {
        if (ship.horizontal) {
            cells.push({ x: ship.x + i, y: ship.y })
        } else {
            cells.push({ x: ship.x, y: ship.y + i })
        }
    }
    return cells
}

/**
 * Finds which ship (if any) is at the given coordinate.
 *
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Array} ships - Array of ships [{size, x, y, horizontal}, ...]
 * @returns {number} Ship index or -1 if no ship at coordinate
 */
function findShipAt(x, y, ships) {
    for (let i = 0; i < ships.length; i++) {
        const ship = ships[i]
        if (ship.horizontal) {
            if (y === ship.y && x >= ship.x && x < ship.x + ship.size) {
                return i
            }
        } else {
            if (x === ship.x && y >= ship.y && y < ship.y + ship.size) {
                return i
            }
        }
    }
    return -1
}

/**
 * Computes and updates shot results for a game using ship placements.
 * Tracks hit cells to determine when ships are sunk.
 *
 * @param {Object} conn - Database connection
 * @param {string} gameId - Game ID
 * @param {Array} playerOneShips - Player 1's ships
 * @param {Array} playerTwoShips - Player 2's ships
 * @param {Object} ctx - Logging context
 * @returns {Promise<number>} Number of shots updated
 */
async function computeShotResults(
    conn,
    gameId,
    playerOneShips,
    playerTwoShips,
    ctx
) {
    // Get all shots for this game ordered by shot number
    const [shots] = await conn.execute(
        `SELECT id, shooter_player, target_x, target_y FROM nc_training_shots
         WHERE game_id = ? ORDER BY shot_number`,
        [gameId]
    )

    // Track hits on each player's ships
    // Key: "shipIndex", Value: Set of hit cell indices
    const player1ShipHits = playerOneShips.map(() => new Set())
    const player2ShipHits = playerTwoShips.map(() => new Set())

    let updated = 0
    for (const shot of shots) {
        // Player 1 shoots at Player 2's ships, Player 2 shoots at Player 1's ships
        const targetShips =
            shot.shooter_player === 1 ? playerTwoShips : playerOneShips
        const shipHits =
            shot.shooter_player === 1 ? player2ShipHits : player1ShipHits

        const shipIndex = findShipAt(shot.target_x, shot.target_y, targetShips)

        let result = "miss"
        let sunkShip = null

        if (shipIndex >= 0) {
            const ship = targetShips[shipIndex]
            const cells = getShipCells(ship)

            // Find which cell of the ship was hit
            const cellIndex = cells.findIndex(
                (c) => c.x === shot.target_x && c.y === shot.target_y
            )

            // Record this hit
            shipHits[shipIndex].add(cellIndex)

            // Check if ship is now sunk (all cells hit)
            if (shipHits[shipIndex].size === ship.size) {
                result = "sunk"
                sunkShip = ship
            } else {
                result = "hit"
            }
        }

        await conn.execute(
            `UPDATE nc_training_shots SET result = ?, sunk_ship_json = ? WHERE id = ?`,
            [result, sunkShip ? JSON.stringify(sunkShip) : null, shot.id]
        )
        updated++
    }

    logger.debug(
        { ...ctx, updatedShots: updated },
        "Shot results computed and updated"
    )
    return updated
}

/**
 * Finalizes a training game record when the game finishes normally.
 * Extracts ship placements from gamefields table and creates the
 * nc_training_games record.
 *
 * Only call this for games with status = SESSION_STATUS.FINISHED_OK (1).
 *
 * @param {bigint|string} gameId - Base session ID (game_sessions.id)
 * @param {Object} ctx - Logging context
 * @returns {Promise<boolean>} Success status
 */
async function dbFinalizeTrainingGame(gameId, ctx) {
    const conn = await pool.getConnection()
    try {
        // Get ship placements from gamefields table
        const [fields] = await conn.execute(
            `SELECT player, field_json FROM gamefields WHERE session_id = ? ORDER BY player`,
            [gameId.toString()]
        )

        if (fields.length < 2) {
            logger.warn(
                { ...ctx, fieldCount: fields.length },
                "Incomplete field data for training game, skipping"
            )
            return false
        }

        // Extract ship data from field_json
        // field_json contains the complete field layout, we need to extract ships
        let playerOneShips = null
        let playerTwoShips = null

        for (const field of fields) {
            logger.debug(
                {
                    ...ctx,
                    player: field.player,
                    fieldJsonType: typeof field.field_json,
                    fieldJsonSample:
                        typeof field.field_json === "string"
                            ? field.field_json.substring(0, 500)
                            : JSON.stringify(field.field_json).substring(0, 500),
                },
                "Processing field data for player"
            )

            const fieldData =
                typeof field.field_json === "string"
                    ? JSON.parse(field.field_json)
                    : field.field_json

            // Extract ships array from field data
            const ships = extractShipsFromField(fieldData)

            logger.debug(
                {
                    ...ctx,
                    player: field.player,
                    extractedShips: ships,
                },
                "Ships extracted for player"
            )

            if (field.player === 0) {
                playerOneShips = ships
            } else {
                playerTwoShips = ships
            }
        }

        if (!playerOneShips || !playerTwoShips) {
            logger.warn(ctx, "Could not extract ships from field data, skipping")
            return false
        }

        // Insert training game record
        await conn.execute(
            `INSERT INTO nc_training_games (id, player_one_ships, player_two_ships)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
                player_one_ships = VALUES(player_one_ships),
                player_two_ships = VALUES(player_two_ships)`,
            [
                gameId.toString(),
                JSON.stringify(playerOneShips),
                JSON.stringify(playerTwoShips),
            ]
        )

        // Compute and update shot results using ship placements
        const updatedShots = await computeShotResults(
            conn,
            gameId.toString(),
            playerOneShips,
            playerTwoShips,
            ctx
        )

        logger.info(
            { ...ctx, shots: updatedShots },
            "Training game finalized with shot results"
        )
        return true
    } catch (error) {
        logger.error(ctx, "dbFinalizeTrainingGame error:", error.message)
        return false
    } finally {
        conn.release()
    }
}

/**
 * Extracts ship placement data from field JSON.
 *
 * Expected field format (BattleField):
 * {
 *   "type": "field",
 *   "name": "enemyfield",
 *   "cells": [...],
 *   "ships": [
 *     { "name": "...", "x": 2, "y": 3, "length": 4, "orientation": 0, ... }
 *   ]
 * }
 *
 * Expected output: Array of {size, x, y, horizontal}
 *
 * @param {Object} fieldData - Parsed field JSON data
 * @returns {Array|null} Array of ship objects or null if extraction fails
 */
function extractShipsFromField(fieldData) {
    try {
        logger.debug(
            {
                fieldType: typeof fieldData,
                fieldKeys: fieldData ? Object.keys(fieldData) : [],
                hasShips: fieldData?.ships ? fieldData.ships.length : 0,
            },
            "Extracting ships from field data"
        )

        // Try ships array (standard BattleField format)
        // Actual format from Naval Clash client:
        // {
        //   "type": "ship",
        //   "parts": [2,2,2],        // cell states
        //   "startX": 0,             // x coordinate
        //   "startY": 7,             // y coordinate
        //   "shipType": 3,           // ship size
        //   "cellCount": 3,          // same as shipType
        //   "orientation": 2         // 1 = horizontal, 2 = vertical
        // }
        if (fieldData.ships && Array.isArray(fieldData.ships)) {
            const ships = fieldData.ships.map((ship, idx) => {
                logger.debug(
                    { idx, shipKeys: Object.keys(ship), ship },
                    "Processing ship"
                )
                return {
                    // Ship size: cellCount, shipType, length, size
                    size:
                        ship.cellCount ??
                        ship.shipType ??
                        ship.length ??
                        ship.size ??
                        ship.s ??
                        ship.len,
                    // Coordinates: startX/startY or x/y
                    x: ship.startX ?? ship.x ?? ship.cx,
                    y: ship.startY ?? ship.y ?? ship.cy,
                    // Orientation: 1 = horizontal, 2 = vertical (Naval Clash format)
                    // Also support: 0 = horizontal (alternative format)
                    horizontal:
                        ship.orientation === 1 ||
                        ship.orientation === 0 ||
                        ship.horizontal === true ||
                        ship.h === true ||
                        ship.or === 0,
                }
            })
            logger.debug({ shipCount: ships.length, ships }, "Extracted ships")
            return ships
        }

        // Try 's' array (compact format)
        if (fieldData.s && Array.isArray(fieldData.s)) {
            const ships = fieldData.s.map((ship) => ({
                size:
                    ship.cellCount ??
                    ship.shipType ??
                    ship.length ??
                    ship.size ??
                    ship.s ??
                    ship.len,
                x: ship.startX ?? ship.x ?? ship.cx,
                y: ship.startY ?? ship.y ?? ship.cy,
                horizontal:
                    ship.orientation === 1 ||
                    ship.orientation === 0 ||
                    ship.horizontal === true ||
                    ship.h === true ||
                    ship.or === 0,
            }))
            logger.debug(
                { shipCount: ships.length, ships },
                "Extracted ships from compact format"
            )
            return ships
        }

        // Unknown format
        logger.warn(
            {
                fieldKeys: Object.keys(fieldData),
                fieldSample: JSON.stringify(fieldData).substring(0, 500),
            },
            "Unknown field format, cannot extract ships"
        )
        return null
    } catch (error) {
        logger.error(
            { fieldData: JSON.stringify(fieldData).substring(0, 500) },
            "extractShipsFromField error:",
            error.message
        )
        return null
    }
}

/**
 * Deletes orphaned training shots for games that didn't finish normally.
 * Should be run periodically to clean up incomplete data.
 *
 * @param {number} olderThanHours - Delete shots older than this many hours
 * @returns {Promise<number>} Number of deleted rows
 */
async function dbCleanupOrphanedTrainingShots(olderThanHours = 24) {
    try {
        const [result] = await pool.execute(
            `DELETE ts FROM nc_training_shots ts
             LEFT JOIN nc_training_games tg ON tg.id = ts.game_id
             WHERE tg.id IS NULL
               AND ts.created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
            [olderThanHours]
        )
        if (result.affectedRows > 0) {
            logger.info(
                { deleted: result.affectedRows },
                "Cleaned up orphaned training shots"
            )
        }
        return result.affectedRows
    } catch (error) {
        logger.error({}, "dbCleanupOrphanedTrainingShots error:", error.message)
        return 0
    }
}

module.exports = {
    dbLogTrainingShot,
    dbGetTrainingShotCount,
    dbFinalizeTrainingGame,
    dbCleanupOrphanedTrainingShots,
    extractShipsFromField,
}
