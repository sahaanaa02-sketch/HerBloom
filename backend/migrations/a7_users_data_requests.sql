ALTER TABLE users
    ADD COLUMN last_active_at DATETIME NULL,
    ADD COLUMN email_verified_at DATETIME NULL,
    ADD COLUMN anonymized_at DATETIME NULL,
    ADD COLUMN session_version INT NOT NULL DEFAULT 0;

CREATE TABLE mother_account_tokens (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    purpose ENUM('password_reset','verify_email') NOT NULL,
    token_hash CHAR(64) NOT NULL,
    email_at_issue VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    UNIQUE KEY uq_a7_account_token (token_hash),
    KEY ix_a7_account_token_user (user_id, purpose),
    CONSTRAINT fk_a7_account_token_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE a7_rate_limits (
    bucket CHAR(64) NOT NULL PRIMARY KEY,
    window_start DATETIME NOT NULL,
    hits INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE data_requests (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('export','delete') NOT NULL,
    status ENUM('requested','confirmed','done','rejected') NOT NULL DEFAULT 'requested',
    requested_by INT NULL,
    confirmed_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    done_at DATETIME NULL,
    file_path VARCHAR(160) NULL,
    expires_at DATETIME NULL,
    download_hash CHAR(64) NULL,
    KEY ix_a7_requests_user (user_id, type, status),
    KEY ix_a7_requests_status (status, created_at),
    CONSTRAINT fk_a7_request_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_a7_request_initiator FOREIGN KEY (requested_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_a7_request_confirmer FOREIGN KEY (confirmed_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE SQL SECURITY INVOKER VIEW v_admin_users AS
SELECT u.id, COALESCE(NULLIF(p.display_name, ''), u.full_name) AS display_name,
       u.email, p.language, u.created_at, u.last_active_at, CAST(NULL AS CHAR(40)) AS plan_name,
       CASE WHEN u.anonymized_at IS NOT NULL THEN 'anonymized'
            WHEN u.is_active THEN 'active' ELSE 'inactive' END AS status
FROM users u LEFT JOIN mother_profiles p ON p.user_id = u.id
WHERE u.role = 'MOTHER';
