-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

CREATE TABLE userlists (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    list_type TINYINT NOT NULL COMMENT '1=friends, 2=blocked',
    rival_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY idx_user_type_rival (user_id, list_type, rival_id),
    KEY idx_user_type (user_id, list_type),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (rival_id) REFERENCES users(id)
) ENGINE=InnoDB;
