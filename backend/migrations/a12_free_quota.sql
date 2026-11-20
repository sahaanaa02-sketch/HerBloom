ALTER TABLE users ADD COLUMN activated_at_utc DATETIME(6) NULL DEFAULT NULL;

CREATE TABLE free_ai_usage_events (
    user_id INT NOT NULL,
    feature ENUM('scan','chat') NOT NULL,
    request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    window_start_utc DATETIME(6) NOT NULL,
    PRIMARY KEY (user_id, feature, request_key),
    KEY ix_free_ai_usage_window (user_id, feature, window_start_utc),
    CONSTRAINT fk_free_ai_usage_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
