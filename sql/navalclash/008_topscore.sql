-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

CREATE TABLE topscores (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    opponent_id INT UNSIGNED,
    score INT NOT NULL,
    time_spent_ms INT,
    game_type TINYINT COMMENT '1=android, 2=bt, 3=web, 4=passplay',
    user_rank INT UNSIGNED,
    opponent_rank INT UNSIGNED,
    game_variant TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    KEY idx_score (score DESC),
    KEY idx_user_score (user_id, score DESC),
    KEY idx_variant_score (game_variant, score DESC),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (opponent_id) REFERENCES users(id)
) ENGINE=InnoDB;
