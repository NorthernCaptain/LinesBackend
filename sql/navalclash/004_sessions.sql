-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

CREATE TABLE game_sessions (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY COMMENT 'Generated session ID (timestamp-based, even)',
    user_one_id INT UNSIGNED,
    user_two_id INT UNSIGNED,
    user_one_connected_at TIMESTAMP(3) NULL,
    user_two_connected_at TIMESTAMP(3) NULL,
    moves_one INT UNSIGNED DEFAULT 0,
    moves_two INT UNSIGNED DEFAULT 0,
    finished_at TIMESTAMP(3) NULL,
    status TINYINT DEFAULT 0 COMMENT 'See finish status codes',
    winner_id INT UNSIGNED,
    score INT,
    version_one INT UNSIGNED,
    version_two INT UNSIGNED,
    device_one_id INT UNSIGNED,
    device_two_id INT UNSIGNED,
    game_type TINYINT DEFAULT 0 COMMENT '0=random, 1=personal',
    game_variant TINYINT DEFAULT 1,
    wifi_one TINYINT,
    wifi_two TINYINT,
    reconnects_one INT UNSIGNED DEFAULT 0,
    reconnects_two INT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    KEY idx_user_one (user_one_id),
    KEY idx_user_two (user_two_id),
    KEY idx_status (status),
    KEY idx_waiting (status, user_two_id, updated_at),
    FOREIGN KEY (user_one_id) REFERENCES users(id),
    FOREIGN KEY (user_two_id) REFERENCES users(id),
    FOREIGN KEY (winner_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Session status codes
-- 0 = WAITING (waiting for opponent)
-- 1 = PLAYING (both connected, game in progress)
-- 10 = FINISHED_OK (game completed normally)
-- 11 = FINISHED_TERMINATED_WAITING (first user left before match)
-- 12 = FINISHED_SURRENDERED (user surrendered)
-- 13 = FINISHED_TIMED_OUT_WAITING (timeout waiting for opponent)
-- 14 = FINISHED_TIMED_OUT_PLAYING (timeout during game)
-- 15 = FINISHED_DUPLICATE (user reconnected with new session)
-- 16 = FINISHED_DISCONNECTED (opponent stopped responding)
