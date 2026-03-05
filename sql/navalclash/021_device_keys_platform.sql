-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

-- Add platform column to device_keys table.
-- Derived from the RSA key index used during handshake:
--   keys 0-3 = android, keys 4-7 = ios
-- No backfill needed — device keys expire in 4 hours.

ALTER TABLE device_keys ADD COLUMN platform VARCHAR(10) DEFAULT NULL AFTER device_uuid;
