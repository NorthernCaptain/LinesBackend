-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(32) NOT NULL,
    uuid VARCHAR(40) NOT NULL,
    lang VARCHAR(16),
    logins INT UNSIGNED DEFAULT 0,
    games INT UNSIGNED DEFAULT 0,
    gameswon INT UNSIGNED DEFAULT 0,
    `rank` INT UNSIGNED DEFAULT 0,
    stars INT UNSIGNED DEFAULT 0,
    isbanned TINYINT DEFAULT 0,
    version INT UNSIGNED DEFAULT 0,
    games_android INT UNSIGNED DEFAULT 0,
    games_bluetooth INT UNSIGNED DEFAULT 0,
    games_web INT UNSIGNED DEFAULT 0,
    games_passplay INT UNSIGNED DEFAULT 0,
    wins_android INT UNSIGNED DEFAULT 0,
    wins_bluetooth INT UNSIGNED DEFAULT 0,
    wins_web INT UNSIGNED DEFAULT 0,
    wins_passplay INT UNSIGNED DEFAULT 0,
    timezone INT DEFAULT 0,
    pin INT UNSIGNED DEFAULT 0,
    face INT UNSIGNED DEFAULT 0,
    status TINYINT DEFAULT 0 COMMENT '0=idle, 1=setup, 2=playing',
    last_game_variant TINYINT DEFAULT 1,
    last_device_id INT UNSIGNED,
    coins INT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY idx_uuid_name (uuid, name),
    KEY idx_name_pin (name, pin),
    KEY idx_updated (updated_at),
    KEY idx_last_device (last_device_id)
) ENGINE=InnoDB;
