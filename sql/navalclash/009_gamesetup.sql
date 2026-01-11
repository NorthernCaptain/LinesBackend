-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

CREATE TABLE gamesetup (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(40) NOT NULL UNIQUE,
    description VARCHAR(200),
    int_value INT,
    float_value DOUBLE,
    string_value TEXT,
    date_value TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Insert default configuration
INSERT INTO gamesetup (name, description, int_value) VALUES
('maintenance_mode', 'Enable maintenance mode (1=on, 0=off)', 0),
('min_version', 'Minimum allowed client version', 0),
('session_timeout_ms', 'Session inactivity timeout in ms', 120000),
('waiting_timeout_ms', 'Waiting for opponent timeout in ms', 120000),
('poll_timeout_ms', 'Long poll timeout in ms', 30000),
('poll_retry_count', 'Number of poll retries', 2);
