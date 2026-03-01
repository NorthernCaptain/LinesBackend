-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

-- Add per-player last_seen timestamps for stale session detection.
-- last_seen_one: updated on every poll/send by player 0
-- last_seen_two: updated on every poll/send by player 1
-- updated_at continues to auto-update on any row change.

ALTER TABLE game_sessions
    ADD COLUMN last_seen_one TIMESTAMP(3) NULL AFTER reconnects_two,
    ADD COLUMN last_seen_two TIMESTAMP(3) NULL AFTER last_seen_one;

-- Backfill: set last_seen_one to updated_at for active sessions
UPDATE game_sessions
SET last_seen_one = updated_at
WHERE status <= 1;

-- Backfill: set last_seen_two to updated_at for in-progress sessions
UPDATE game_sessions
SET last_seen_two = updated_at
WHERE status = 1 AND user_two_id IS NOT NULL;
