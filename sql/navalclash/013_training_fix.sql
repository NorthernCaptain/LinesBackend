-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

-- Migration: Make nc_training_shots.result nullable
-- The game protocol is peer-to-peer; shot results are determined client-side
-- and never sent to the server. Results must be computed at export time.

ALTER TABLE nc_training_shots
    MODIFY COLUMN result ENUM('hit', 'miss', 'sunk') NULL
    COMMENT 'Computed at export time from ship placements';

-- Clear existing 'miss' values that were set as defaults
-- These will be properly computed during data export
UPDATE nc_training_shots SET result = NULL WHERE result IS NOT NULL;
