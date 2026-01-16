-- Matchmaking lock table to prevent race conditions
-- When two players connect simultaneously and no waiting session exists,
-- without this lock both would create their own sessions and wait forever.
-- This table provides a row-level lock per game variant to serialize matchmaking.

CREATE TABLE IF NOT EXISTS matchmaking_locks (
    game_variant INT UNSIGNED NOT NULL PRIMARY KEY,
    description VARCHAR(50) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Pre-populate with known game variants
-- Variant 1: Classic (10x10)
-- Variant 2: Extended
-- Variant 3: Mini
INSERT INTO matchmaking_locks (game_variant, description) VALUES
    (1, 'Classic 10x10'),
    (2, 'Extended'),
    (3, 'Mini'),
    (4, 'Reserved')
ON DUPLICATE KEY UPDATE description = VALUES(description);
