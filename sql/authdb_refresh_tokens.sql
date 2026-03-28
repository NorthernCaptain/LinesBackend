-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

-- Create refresh_tokens table for OAuth2 refresh token rotation
CREATE TABLE IF NOT EXISTS authdb.refresh_tokens (
    token VARCHAR(128) NOT NULL PRIMARY KEY,
    client_id VARCHAR(64) NOT NULL,
    user_id INT NOT NULL,
    expires_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
