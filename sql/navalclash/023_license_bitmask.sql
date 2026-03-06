-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

-- Migration: Convert license_status from enum-style values to bitmask
-- Old values: 1=LICENSED, 2=NOT_LICENSED, 3=RETRY, 4=NON_APPLICABLE
-- New bitmask: bit0=LVL_LICENSED(1), bit1=LVL_NOT_LICENSED(2), bit2=LVL_RETRY(4),
--              bit3=INT_DEVICE_OK(8), bit4=INT_APP_RECOGNIZED(16),
--              bit5=INT_LICENSED(32), bit6=INT_CHECKED(64)

-- Old 3 (RETRY) maps to new 4 (bit 2 = LVL_RETRY)
UPDATE devices SET license_status = 4 WHERE license_status = 3;

-- Old 4 (NON_APPLICABLE) maps to 0 (no bits set)
UPDATE devices SET license_status = 0 WHERE license_status = 4;

-- Old 1 (LICENSED) and 2 (NOT_LICENSED) map directly to the same values, no change needed
