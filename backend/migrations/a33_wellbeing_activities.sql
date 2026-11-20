ALTER TABLE wellbeing_activities
    ADD COLUMN title_ta VARCHAR(120) NULL DEFAULT NULL,
    ADD COLUMN steps_ta JSON NULL,
    ADD COLUMN audio_media_id INT NULL DEFAULT NULL,
    ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN editorial_status ENUM('draft','in_review','archived') NULL DEFAULT NULL,
    ADD COLUMN created_by INT NULL DEFAULT NULL,
    ADD COLUMN updated_by INT NULL DEFAULT NULL,
    ADD COLUMN created_at DATETIME NULL DEFAULT NULL,
    ADD COLUMN updated_at DATETIME NULL DEFAULT NULL,
    ADD CONSTRAINT fk_wellbeing_activities_audio FOREIGN KEY (audio_media_id) REFERENCES media_files (id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_wellbeing_activities_created_by FOREIGN KEY (created_by) REFERENCES admin_users (id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_wellbeing_activities_updated_by FOREIGN KEY (updated_by) REFERENCES admin_users (id) ON DELETE SET NULL;
