-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

-- Add license verification columns to devices table
ALTER TABLE devices
    ADD COLUMN license_status TINYINT UNSIGNED DEFAULT NULL
    COMMENT 'NULL=not_set, 1=licensed, 2=not_licensed, 3=retry, 4=non_applicable',
    ADD COLUMN license_nonce BIGINT DEFAULT NULL,
    ADD COLUMN license_checked_at TIMESTAMP NULL DEFAULT NULL;
