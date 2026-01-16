-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

-- Users currently waiting for opponents (legacy view, kept for compatibility)
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

-- Online users: waiting for opponents + currently playing
-- last_seen values: -1 = playing, -2 = setting up ships, >0 = seconds since last seen
-- is_playing: 0 = waiting (joinable), 1 = in game (not joinable)
-- Deduplicated by user_id, prioritizing active games over waiting sessions
CREATE OR REPLACE VIEW v_online_users AS
WITH all_online AS (
    -- Users waiting for opponents (can be joined)
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
        u.status,
        CASE
            WHEN u.status = 2 THEN -1
            WHEN u.status = 1 AND u.updated_at > DATE_SUB(NOW(), INTERVAL 2 MINUTE) THEN -2
            ELSE TIMESTAMPDIFF(SECOND, u.updated_at, NOW())
        END as last_seen,
        0 as is_playing
    FROM game_sessions gs
    JOIN users u ON u.id = gs.user_one_id
    WHERE gs.status = 0
      AND gs.user_two_id IS NULL
      AND gs.updated_at > DATE_SUB(NOW(), INTERVAL 2 MINUTE)

    UNION ALL

    -- Player one in active games
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
        u.status,
        -1 as last_seen,
        1 as is_playing
    FROM game_sessions gs
    JOIN users u ON u.id = gs.user_one_id
    WHERE gs.status IN (0, 1)
      AND gs.user_two_id IS NOT NULL
      AND gs.updated_at > DATE_SUB(NOW(), INTERVAL 2 MINUTE)

    UNION ALL

    -- Player two in active games
    SELECT
        gs.id as session_id,
        gs.user_two_id as user_id,
        gs.game_variant,
        gs.version_two as version,
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
        u.status,
        -1 as last_seen,
        1 as is_playing
    FROM game_sessions gs
    JOIN users u ON u.id = gs.user_two_id
    WHERE gs.status IN (0, 1)
      AND gs.user_two_id IS NOT NULL
      AND gs.updated_at > DATE_SUB(NOW(), INTERVAL 2 MINUTE)
),
ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (
               PARTITION BY user_id, game_variant
               ORDER BY is_playing DESC, updated_at DESC
           ) as rn
    FROM all_online
)
SELECT
    session_id, user_id, game_variant, version, created_at, updated_at,
    name, uuid, face, `rank`, stars, games, gameswon, lang, status,
    last_seen, is_playing
FROM ranked
WHERE rn = 1;

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
