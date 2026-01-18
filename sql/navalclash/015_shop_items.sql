-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

-- Drop and recreate shop_items table with correct schema for Armory weapons
DROP TABLE IF EXISTS shop_items;

-- Game Bonus Coin Rules (for reference - see ONLINE.md for full docs):
-- Index 0: WIN_BONUS - normal win - winner gets 9 + capped rank delta
-- Index 1: LOST_BONUS - normal loss - loser gets -1
-- Index 2: SURRENDER_WIN_BONUS - max(WIN_BONUS/2, 1)
-- Index 3: SURRENDER_LOST_BONUS - player surrendered - loser gets -2
-- Index 4: INTERRUPT_WIN_BONUS - opponent disconnected - winner gets 1
-- Index 5: INTERRUPT_LOST_BONUS - player disconnected - loser gets 0
-- Index 7: LOST_BONUS_WITH_WEAPONS - loss when using special weapons - loser gets +2

CREATE TABLE shop_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    weapon_index TINYINT UNSIGNED NOT NULL COMMENT '0=mine, 1=dutch, 2=radar, 3=shuffle, 4=stealth, 5=cshield',
    price INT UNSIGNED NOT NULL COMMENT 'Price in coins',
    min_qty INT UNSIGNED DEFAULT 1 COMMENT 'Minimum purchase quantity',
    max_qty INT UNSIGNED DEFAULT 99 COMMENT 'Maximum purchase quantity',
    unlock_price INT UNSIGNED DEFAULT 0 COMMENT 'Price to unlock (0 if already unlocked)',
    purchase_type CHAR(1) DEFAULT 'I' COMMENT 'I=internal (coins), G=google play',
    is_active TINYINT DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY idx_weapon (weapon_index),
    KEY idx_active (is_active, sort_order)
) ENGINE=InnoDB;

-- Armory weapons purchasable with in-game coins
-- Weapon indices: 0=mine, 1=dutch (Flying Dutchman), 2=radar, 3=shuffle, 4=stealth, 5=cshield (combat shield)
INSERT INTO shop_items (weapon_index, price, min_qty, max_qty, unlock_price, purchase_type, sort_order) VALUES
(0, 50, 1, 99, 0, 'I', 0),   -- Mine
(1, 75, 1, 99, 0, 'I', 1),   -- Flying Dutchman
(2, 40, 1, 99, 0, 'I', 2),   -- Radar
(3, 60, 1, 99, 0, 'I', 3),   -- Shuffle
(4, 80, 1, 99, 0, 'I', 4),   -- Stealth
(5, 100, 1, 99, 0, 'I', 5);  -- Combat Shield
