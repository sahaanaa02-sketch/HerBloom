ALTER TABLE admin_users ADD COLUMN session_version INT NOT NULL DEFAULT 0;

CREATE TABLE admin_invites (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    invited_by INT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    UNIQUE KEY uq_a9_invite_token (token_hash),
    KEY ix_a9_invites_admin (admin_id, expires_at),
    CONSTRAINT fk_a9_invite_admin FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_a9_invite_actor FOREIGN KEY (invited_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE legal_pages (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    type ENUM('privacy','terms','refund','disclaimer') NOT NULL,
    version INT NOT NULL,
    body_en MEDIUMTEXT NOT NULL,
    body_ta MEDIUMTEXT NOT NULL,
    published_at DATETIME NULL,
    published_by INT NULL,
    created_by INT NULL,
    updated_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_a9_legal_version (type, version),
    CONSTRAINT fk_a9_legal_created FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_a9_legal_updated FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_a9_legal_publisher FOREIGN KEY (published_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_settings (
    `key` VARCHAR(64) NOT NULL PRIMARY KEY,
    value_json JSON NOT NULL,
    updated_by INT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_a9_setting_updated FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
