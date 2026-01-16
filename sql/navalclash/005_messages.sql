-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

CREATE TABLE session_messages (
    msg_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sender_session_id BIGINT UNSIGNED NOT NULL COMMENT 'Full session ID of sender (includes player bit)',
    msg_type VARCHAR(16) NOT NULL,
    body JSON NOT NULL,
    created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6),

    KEY idx_sender_msg (sender_session_id, msg_id)
) ENGINE=InnoDB;

-- Table for tracking active polls (optional, can be in-memory only)
CREATE TABLE active_polls (
    session_id BIGINT UNSIGNED NOT NULL PRIMARY KEY COMMENT 'Full session ID (includes player bit)',
    poll_id BIGINT UNSIGNED NOT NULL,
    worker_id INT UNSIGNED NOT NULL,
    request_id VARCHAR(36) NOT NULL,
    after_msg_id BIGINT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),

    KEY idx_request (request_id)
) ENGINE=InnoDB;
