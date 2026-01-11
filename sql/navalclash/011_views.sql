-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

-- Users currently waiting for opponents
CREATE OR REPLACE VIEW v_waiting_users AS
SELECT
    gs.id as session_id,
    gs.user_one_id as user_id,
    gs.game_variant,
    gs.version_one as version,
    gs.created_at,
    gs.updated_at,
    u.name,
    u.uuid,
    u.face,
    u.`rank`,
    u.stars,
    u.games,
    u.gameswon,
    u.lang,
    u.status
FROM game_sessions gs
JOIN users u ON u.id = gs.user_one_id
WHERE gs.status = 0
  AND gs.user_two_id IS NULL
  AND gs.updated_at > DATE_SUB(NOW(), INTERVAL 2 MINUTE);

-- Recent opponents for a user (to be filtered by user_id in query)
CREATE OR REPLACE VIEW v_recent_opponents AS
SELECT
    gs.id as session_id,
    gs.user_one_id,
    gs.user_two_id,
    gs.winner_id,
    gs.created_at as played_at,
    gs.status
FROM game_sessions gs
WHERE gs.status >= 10;
