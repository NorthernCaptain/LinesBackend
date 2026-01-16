-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

CREATE TABLE purchases (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    device_id INT UNSIGNED,
    sku VARCHAR(64) NOT NULL,
    order_id VARCHAR(128),
    purchase_token TEXT,
    purchase_state TINYINT DEFAULT 0,
    quantity INT DEFAULT 1,
    coins_added INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    KEY idx_user (user_id),
    KEY idx_order (order_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE user_inventory (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    item_type VARCHAR(32) NOT NULL,
    item_id VARCHAR(32) NOT NULL,
    quantity INT DEFAULT 0,
    times_used INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY idx_user_item (user_id, item_type, item_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
