-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

-- Add weapon tracking columns to game_sessions
-- Weapons are tracked per session (not consumed until game end)
-- JSON format: { "radar": N, "shuffle": N, "mine": N, "dutch": N, "stealth": N }

ALTER TABLE game_sessions
ADD COLUMN weapons_tracked_one JSON COMMENT 'Player 0 weapons placed: { weaponId: count }',
ADD COLUMN weapons_tracked_two JSON COMMENT 'Player 1 weapons placed: { weaponId: count }',
ADD COLUMN weapons_used_one JSON COMMENT 'Player 0 weapon usage: { radar: N, shuffle: N }',
ADD COLUMN weapons_used_two JSON COMMENT 'Player 1 weapon usage: { radar: N, shuffle: N }';
