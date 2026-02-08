-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

-- Device encryption keys table.
-- Stores the AES key established during RSA handshake.
-- Key is associated with a device, not a user.

CREATE TABLE IF NOT EXISTS device_keys (
    device_token CHAR(44) PRIMARY KEY,       -- Base64 of 32 bytes = 44 chars
    device_key VARBINARY(32) NOT NULL,       -- Raw AES-256 key (32 bytes)
    device_uuid VARCHAR(64) NOT NULL,        -- Device UUID from handshake
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,

    INDEX idx_expires (expires_at),
    INDEX idx_device (device_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cleanup job: run periodically (e.g., every hour via cron)
-- DELETE FROM device_keys WHERE expires_at < NOW();
