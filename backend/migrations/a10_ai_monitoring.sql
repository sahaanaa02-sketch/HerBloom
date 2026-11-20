CREATE TABLE ai_usage (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    feature ENUM('scan','chat','summary','plan') NOT NULL,
    model VARCHAR(100) NOT NULL,
    input_tokens INT NULL,
    output_tokens INT NULL,
    est_cost_usd DECIMAL(16,8) NULL,
    success BOOLEAN NOT NULL,
    latency_ms INT NOT NULL,
    created_at DATETIME NOT NULL,
    scanner_corrected BOOLEAN NULL,
    KEY ix_a10_usage_date_feature (created_at,feature)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE prompt_versions (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    feature ENUM('scan','chat','summary','plan') NOT NULL,
    version INT NOT NULL,
    system_prompt TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_a10_prompt_version (feature,version),
    CONSTRAINT fk_a10_prompt_creator FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ai_daily_quota (
    account_key CHAR(64) NOT NULL,
    feature ENUM('scan','chat','summary','plan') NOT NULL,
    quota_day DATE NOT NULL,
    used INT NOT NULL,
    PRIMARY KEY (account_key,feature,quota_day),
    KEY ix_a10_quota_day (quota_day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ai_feedback_reviews (
    feedback_id INT NOT NULL PRIMARY KEY,
    share_content BOOLEAN NOT NULL DEFAULT FALSE,
    status ENUM('new','reviewed','content_fixed') NOT NULL DEFAULT 'new',
    reviewer_note TEXT NULL,
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    CONSTRAINT fk_a10_feedback FOREIGN KEY (feedback_id) REFERENCES chat_feedback(id) ON DELETE CASCADE,
    CONSTRAINT fk_a10_feedback_reviewer FOREIGN KEY (reviewed_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE chat_messages
    ADD COLUMN question_message_id INT NULL,
    ADD KEY ix_a10_question_message (question_message_id),
    ADD CONSTRAINT fk_a10_question_message FOREIGN KEY (question_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL;

CREATE TABLE ai_settings (
    feature ENUM('scan','chat','summary','plan') NOT NULL PRIMARY KEY,
    enabled BOOLEAN NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    max_output_tokens INT NULL,
    temperature DECIMAL(4,3) NOT NULL,
    daily_limit_free INT NULL,
    daily_limit_premium INT NULL,
    price_in_per_m DECIMAL(12,6) NULL,
    price_out_per_m DECIMAL(12,6) NULL,
    updated_by INT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_a10_settings_admin FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
