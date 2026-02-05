/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 *
 * Centralized constants for the Naval Clash backend.
 * All game-related constants should be defined here.
 */

// =============================================================================
// INFO MESSAGE CONSTANTS (MSG_*)
// These match InfoMessage.java in the client
// =============================================================================

const MSG = {
    // Basic messages (1-10)
    WELCOME: 1,
    HURRY_UP: 2,
    USER_READY: 3,
    LAST_CONNECT: 4,
    LEFT_SCREEN: 5,
    ANY_TEXT: 6,
    USER_SETUP: 7,
    CHAT: 8,
    USER_BANNED: 9,
    USER_CHEATED: 10,

    // System messages (11-17)
    MAINTENANCE: 11,
    NEW_VERSION: 12,
    OLD_VERSION: 13, // Warning: version is old but allowed
    OLD_FORBIDDEN_VERSION: 14, // Error: version too old, must update
    PUNISHMENT: 15,
    PAUSED_GAME: 16,
    RESUMED_GAME: 17,

    // Personal rival messages (26-31)
    PERSONAL_RIVAL_SETUP: 26, // Rival is setting up ships
    PERSONAL_RIVAL_PLAYING: 27, // Rival is currently playing
    PERSONAL_RIVAL_REQUEST: 28, // Personal game invitation request
    PERSONAL_RIVAL_REJECTED: 29, // Invitation rejected
    PERSONAL_RIVAL_FINISHED_GAME: 30, // Rival finished their game
    PERSONAL_RIVAL_ACCEPTED: 31, // Invitation accepted

    // Error messages (40-41)
    ERROR_NO_INET: 40,
    COMMUNICATION_ERR: 41,
}

// =============================================================================
// SESSION STATUS CONSTANTS
// Game session lifecycle states stored in game_sessions.status
// =============================================================================

const SESSION_STATUS = {
    WAITING: 0, // Waiting for second player
    IN_PROGRESS: 1, // Both players connected, game in progress

    // Finished states (2-12)
    FINISHED_TERMINATED_WAITING: 2, // Waiting session terminated (player left)
    FINISHED_SURRENDERED_AUTO: 3, // Auto-surrender (opponent disconnected)
    FINISHED_SURRENDERED: 4, // Player surrendered
    FINISHED_TIMED_OUT_WAITING: 5, // Waiting session timed out
    FINISHED_TIMED_OUT_PLAYING: 6, // Playing session timed out
    FINISHED_TERMINATED_DUPLICATE: 7, // Terminated due to user reconnecting
    FINISHED_LEFT_OLD: 8, // Old session left
    FINISHED_NOT_PINGABLE: 9, // Session not pingable
    FINISHED_OK: 10, // Game finished normally
    FINISHED_SLEEP_CHEATER: 11, // Sleep cheater detected
    FINISHED_TIMED_BANNED: 12, // Banned for timeout
}

// =============================================================================
// USER STATUS CONSTANTS
// User presence/activity states stored in users.status
// =============================================================================

const USER_STATUS = {
    IDLE: 0, // In menus, not actively playing
    SETUP: 1, // Setting up ships (field editor)
    PLAYING: 2, // In active game
}

// =============================================================================
// GAME TYPE CONSTANTS
// Stored in game_sessions.game_type
// =============================================================================

const GAME_TYPE = {
    RANDOM: 0, // Random matchmaking
    PERSONAL: 1, // Personal game (invited rival)
}

// =============================================================================
// LIST TYPE CONSTANTS
// For user lists (friends/blocked) in userlists.list_type
// =============================================================================

const LIST_TYPE = {
    FRIENDS: 1, // Friends/saved rivals
    BLOCKED: 2, // Blocked/rejected users
}

// =============================================================================
// RIVAL INFO TYPE CONSTANTS
// Used in social API responses to identify rival source
// Must match RivalInfo.java in client
// =============================================================================

const RIVAL_TYPE = {
    SEARCH: 1, // From search results
    RECENT: 2, // From recent opponents
    SAVED: 3, // From friends list
    REJECTED: 4, // From blocked list
}

// =============================================================================
// BONUS TYPE CONSTANTS
// Game result bonus types for calculateBonus()
// =============================================================================

const BONUS_TYPE = {
    WIN_BONUS: 0, // Normal win
    LOST_BONUS: 1, // Normal loss
    SURRENDER_WIN_BONUS: 2, // Won by opponent surrender
    SURRENDER_LOST_BONUS: 3, // Lost by surrender
    INTERRUPT_WIN_BONUS: 4, // Won by opponent disconnect
    INTERRUPT_LOST_BONUS: 5, // Lost by disconnect
    // Index 6 is unused
    LOST_BONUS_WITH_WEAPONS: 7, // Lost but used weapons
}

// =============================================================================
// WEAPON CONSTANTS
// Weapon codes, IDs, and names
// =============================================================================

// Weapon code to inventory item ID mapping
// Supports both short codes (wmn, dch) and full names (mine, dutch)
const WEAPON_CODE_TO_ID = {
    wmn: "0", // Mine
    mine: "0",
    dch: "1", // Dutch (water bombs)
    dutch: "1",
    anr: "2", // Radar
    radar: "2",
    smw: "3", // Shuffle/Ship Move
    shuffle: "3",
    sth: "4", // Stealth
    stealth: "4",
    csh: "5", // Chain Shield
    cls: "5", // Classic Shield (alias)
    cshield: "5",
}

// Weapon ID to name mapping
const WEAPON_ID_TO_NAME = {
    0: "mine",
    1: "dutch",
    2: "radar",
    3: "shuffle",
    4: "stealth",
    5: "cshield",
}

// Weapon names array (index = weapon ID)
const WEAPON_NAMES = ["mine", "dutch", "radar", "shuffle", "stealth", "cshield"]

// =============================================================================
// BUY/SHOP ERROR CONSTANTS
// Error codes for shop purchase operations
// =============================================================================

const BUY_ERROR = {
    SUCCESS: 0,
    WRONG_PRICE: 3,
    DENIED: -1,
}

// =============================================================================
// VERSION CONSTANTS
// Client version thresholds for feature detection
// =============================================================================

const VERSION = {
    // AI agent version range (2100-2200)
    // Agents can only play vs humans, not other agents
    AGENT_MIN: 2100,
    AGENT_MAX: 2200,

    // Minimum version for paid/premium features
    PAID_MIN: 2000,

    // Minimum version to include topstars in leaderboard response
    TOPSTARS_MIN: 30,
}

// =============================================================================
// RANK CONSTANTS
// Rank calculation thresholds and coin rewards
// =============================================================================

// Base coins for winning a game
const BASE_WIN_COINS = 9

// Maximum rank difference for bonus calculation
const MAX_RANK_DELTA = 5

// Star thresholds for each rank (paid version)
// Index = rank level, value = minimum stars required
const RANK_THRESHOLDS_PAID = [
    0, // Rank 0: 0 stars
    0, // Rank 1: 0 stars (starting rank)
    20, // Rank 2: 20 stars
    80, // Rank 3: 80 stars
    200, // Rank 4: 200 stars
    400, // Rank 5: 400 stars
    700, // Rank 6: 700 stars
    1100, // Rank 7: 1100 stars
    1600, // Rank 8: 1600 stars
    2300, // Rank 9: 2300 stars
    3200, // Rank 10: 3200 stars
]

// Star thresholds for each rank (free version - more lenient)
const RANK_THRESHOLDS_FREE = [
    0, 0, 10, 30, 60, 100, 200, 350, 600, 900, 1400,
]

// Default rank thresholds (use paid version)
const RANK_THRESHOLDS = RANK_THRESHOLDS_PAID

// =============================================================================
// TIMING CONSTANTS
// Various timeout and cache duration values
// =============================================================================

const TIMING = {
    // Long polling timeout for /receive endpoint (30 seconds)
    POLL_TIMEOUT_MS: 30000,

    // Config cache TTL (1 hour)
    CACHE_TTL_MS: 60 * 60 * 1000,

    // Session considered stale after this time (2 minutes)
    SESSION_STALE_MS: 2 * 60 * 1000,

    // Rival status considered "red" (disconnected) after 11 seconds
    RIVAL_RED_TIME_MS: 11000,
}

// =============================================================================
// FIELD ENCODING CONSTANTS
// For battlefield encoding/decoding
// =============================================================================

const FIELD = {
    // Shift value for field encoding
    SHIFT_VAL: 5,
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    // Message constants
    MSG,

    // Session and game state
    SESSION_STATUS,
    USER_STATUS,
    GAME_TYPE,

    // Social features
    LIST_TYPE,
    RIVAL_TYPE,

    // Game mechanics
    BONUS_TYPE,
    BASE_WIN_COINS,
    MAX_RANK_DELTA,
    RANK_THRESHOLDS,
    RANK_THRESHOLDS_PAID,
    RANK_THRESHOLDS_FREE,

    // Weapons
    WEAPON_CODE_TO_ID,
    WEAPON_ID_TO_NAME,
    WEAPON_NAMES,

    // Shop
    BUY_ERROR,

    // Versions
    VERSION,

    // Timing
    TIMING,

    // Field encoding
    FIELD,
}
