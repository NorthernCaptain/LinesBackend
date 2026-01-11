-- Naval Clash - Multiplayer Battleship Game
-- Copyright (c) 2026 NorthernCaptain
-- All rights reserved.

CREATE TABLE devices (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    android_id VARCHAR(32) NOT NULL,
    device VARCHAR(64),
    model VARCHAR(128),
    manufacturer VARCHAR(128),
    product VARCHAR(64),
    os_version VARCHAR(64),
    disp_dpi INT,
    disp_height INT,
    disp_width INT,
    disp_scale FLOAT,
    disp_size VARCHAR(32),
    app_version INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY idx_android_id (android_id)
) ENGINE=InnoDB;

-- Note: android_id (Settings.Secure.ANDROID_ID) is stable across OS upgrades
-- but changes on factory reset. Unique per app signing key + user + device.
-- Removed: tele_id, wifi_id (require permissions), fingerprint/board/os_tags
-- (fingerprint changes on every OS update, not useful for device ID).

-- Junction table: tracks all devices used by each user
CREATE TABLE user_devices (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    device_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY idx_user_device (user_id, device_id),
    KEY idx_device (device_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Add foreign key for last_device_id after devices table exists
ALTER TABLE users ADD CONSTRAINT fk_users_last_device
    FOREIGN KEY (last_device_id) REFERENCES devices(id) ON DELETE SET NULL;
