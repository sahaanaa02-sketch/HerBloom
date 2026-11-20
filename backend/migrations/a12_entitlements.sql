ALTER TABLE free_ai_usage_events
    ADD COLUMN entitlement_code ENUM('free','trial','premium') NOT NULL DEFAULT 'free',
    ADD KEY ix_ai_usage_entitlement_window (user_id, feature, entitlement_code, window_start_utc);

CREATE TABLE entitlement_periods (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    plan_code ENUM('trial','premium') NOT NULL,
    source_ref VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    starts_at_utc DATETIME(6) NOT NULL,
    ends_at_utc DATETIME(6) NOT NULL,
    trial_user_id INT GENERATED ALWAYS AS (IF(plan_code='trial',user_id,NULL)) STORED,
    UNIQUE KEY uq_entitlement_source (source_ref),
    UNIQUE KEY uq_entitlement_trial_once (trial_user_id),
    KEY ix_entitlement_owner_period (user_id, starts_at_utc, ends_at_utc),
    CONSTRAINT ck_entitlement_period_dates CHECK (starts_at_utc < ends_at_utc),
    CONSTRAINT fk_entitlement_account FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE weekly_insights (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entitlement_id INT NOT NULL,
    starts_at_utc DATETIME(6) NOT NULL,
    ends_at_utc DATETIME(6) NOT NULL,
    note TEXT NOT NULL,
    language ENUM('en','ta') NOT NULL,
    generated_at_utc DATETIME(6) NOT NULL,
    recorded_days TINYINT UNSIGNED NOT NULL,
    UNIQUE KEY uq_insight_interval (entitlement_id, starts_at_utc),
    CONSTRAINT fk_insight_entitlement FOREIGN KEY (entitlement_id) REFERENCES entitlement_periods (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
