-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

-- Training data: ship placements for completed games
-- Uses same ID as game_sessions (FK relationship)
-- Only games with status = FINISHED_OK (1) should be inserted
CREATE TABLE nc_training_games (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY COMMENT 'Same as game_sessions.id',
    player_one_ships JSON NOT NULL COMMENT 'Player 1 ship placements [{size, x, y, horizontal}, ...]',
    player_two_ships JSON NOT NULL COMMENT 'Player 2 ship placements [{size, x, y, horizontal}, ...]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (id) REFERENCES game_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Training data: raw shot events
-- Shot results are logged as they happen during gameplay
-- Grid state reconstruction is done during data export (in Python)
CREATE TABLE nc_training_shots (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    game_id BIGINT UNSIGNED NOT NULL COMMENT 'References nc_training_games.id',
    shot_number SMALLINT UNSIGNED NOT NULL COMMENT 'Sequential shot number in game',
    shooter_player TINYINT NOT NULL COMMENT '1 or 2 - player who made the shot',
    target_x TINYINT UNSIGNED NOT NULL COMMENT '0-9 X coordinate',
    target_y TINYINT UNSIGNED NOT NULL COMMENT '0-9 Y coordinate',
    result ENUM('hit', 'miss', 'sunk') NULL COMMENT 'Computed at export time from ship placements',
    sunk_ship_json JSON NULL COMMENT 'Ship info if sunk: {size, x, y, horizontal}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_game_shot (game_id, shot_number),
    INDEX idx_game_id (game_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Note: FK constraint to nc_training_games is not added here because
-- shots are logged during gameplay, before the game record is finalized.
-- Orphaned shots (from games that don't finish normally) are cleaned up
-- periodically or ignored during export by JOINing with nc_training_games.
