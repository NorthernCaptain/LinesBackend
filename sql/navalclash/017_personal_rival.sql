-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

-- Add target_rival_id column to game_sessions for personal game invitations
-- When a player creates a waiting session targeting a specific rival,
-- the rival's user ID is stored here. The rival can then be notified
-- via the umarker endpoint and respond via uanswer.

ALTER TABLE game_sessions
    ADD COLUMN target_rival_id INT UNSIGNED NULL AFTER game_type,
    ADD KEY idx_target_rival (target_rival_id, status),
    ADD FOREIGN KEY (target_rival_id) REFERENCES users(id);
