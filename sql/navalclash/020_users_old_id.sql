-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

-- Add old_id column to users table for mapping legacy user IDs
ALTER TABLE users ADD COLUMN old_id INT UNSIGNED NULL AFTER id;
ALTER TABLE users ADD KEY idx_old_id (old_id);

-- Widen isbanned from TINYINT to SMALLINT UNSIGNED (legacy data uses bitmask values up to 4096)
ALTER TABLE users MODIFY COLUMN isbanned SMALLINT UNSIGNED DEFAULT 0;
