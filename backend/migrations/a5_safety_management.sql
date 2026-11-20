CREATE TABLE warning_signs (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    audience ENUM('mother','baby') NOT NULL,
    text_en TEXT NOT NULL,
    text_ta TEXT NOT NULL,
    sort_order INT NOT NULL,
    status ENUM('in_review','published','archived') NOT NULL DEFAULT 'in_review',
    created_by INT NULL,
    updated_by INT NULL,
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_a5_warning_signs_created_by FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_a5_warning_signs_updated_by FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_a5_warning_signs_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE red_flag_terms (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    term VARCHAR(160) NOT NULL,
    lang ENUM('en','ta') NOT NULL,
    category ENUM('urgent','crisis') NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    status ENUM('in_review','published','archived') NOT NULL DEFAULT 'in_review',
    created_by INT NULL,
    updated_by INT NULL,
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_a5_term (lang, term),
    CONSTRAINT fk_a5_red_flag_terms_created_by FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_a5_red_flag_terms_updated_by FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_a5_red_flag_terms_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE safety_messages (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    message_key ENUM('urgent_card','crisis_card','no_info') NOT NULL,
    body_en TEXT NOT NULL,
    body_ta TEXT NOT NULL,
    version INT NOT NULL,
    status ENUM('in_review','published','archived') NOT NULL DEFAULT 'in_review',
    created_by INT NULL,
    updated_by INT NULL,
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_a5_message_version (message_key, version),
    CONSTRAINT fk_a5_safety_messages_created_by FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_a5_safety_messages_updated_by FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_a5_safety_messages_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE helplines (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name_en VARCHAR(160) NOT NULL,
    name_ta VARCHAR(160) NOT NULL,
    number VARCHAR(32) NOT NULL,
    description_en TEXT NOT NULL,
    description_ta TEXT NOT NULL,
    sort_order INT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    status ENUM('in_review','published','archived') NOT NULL DEFAULT 'in_review',
    created_by INT NULL,
    updated_by INT NULL,
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_a5_helplines_created_by FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_a5_helplines_updated_by FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_a5_helplines_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE safety_events
    ADD COLUMN source VARCHAR(30) NULL DEFAULT NULL,
    ADD INDEX ix_a5_safety_event_week (created_at, category, source);
