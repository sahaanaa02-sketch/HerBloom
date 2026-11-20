CREATE TABLE announcements (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title_en VARCHAR(180) NOT NULL,
    title_ta VARCHAR(180) NOT NULL,
    body_en TEXT NOT NULL,
    body_ta TEXT NOT NULL,
    week_min SMALLINT UNSIGNED NULL,
    week_max SMALLINT UNSIGNED NULL,
    delivery_type ENUM('vaginal','csection') NULL,
    language ENUM('en','ta') NULL,
    plan VARCHAR(40) NULL,
    channel ENUM('banner','bell') NOT NULL,
    start_at DATETIME NOT NULL,
    end_at DATETIME NOT NULL,
    status ENUM('draft','published') NOT NULL DEFAULT 'draft',
    KEY ix_a11_announcements_window (status, start_at, end_at),
    CONSTRAINT ck_a11_announcement_dates CHECK (start_at < end_at),
    CONSTRAINT ck_a11_announcement_weeks CHECK (week_min IS NULL OR week_max IS NULL OR week_min <= week_max)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_tips (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    week SMALLINT UNSIGNED NOT NULL,
    text_en TEXT NOT NULL,
    text_ta TEXT NOT NULL,
    status ENUM('draft','in_review','published','archived') NOT NULL DEFAULT 'draft',
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    KEY ix_a11_tips_week (status, week, id),
    CONSTRAINT fk_a11_tip_reviewer FOREIGN KEY (reviewed_by) REFERENCES admin_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reminder_templates (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key` ENUM('water','rest','mood','meals','recovery','medicine','appointment','gdm_test') NOT NULL UNIQUE,
    text_en TEXT NOT NULL,
    text_ta TEXT NOT NULL,
    status ENUM('draft','published') NOT NULL DEFAULT 'draft'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
