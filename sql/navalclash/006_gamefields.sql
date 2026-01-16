-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

CREATE TABLE gamefields (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT UNSIGNED NOT NULL,
    player TINYINT NOT NULL COMMENT '0 or 1',
    user_id INT UNSIGNED NOT NULL,
    uuid VARCHAR(40),
    field_json JSON,
    flags INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY idx_session_player (session_id, player),
    KEY idx_uuid (uuid),
    FOREIGN KEY (session_id) REFERENCES game_sessions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
