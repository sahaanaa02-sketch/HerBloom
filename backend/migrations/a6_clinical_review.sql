CREATE TABLE content_reviews (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entity VARCHAR(40) NOT NULL,
    entity_id INT NOT NULL,
    submitted_by INT NULL,
    reviewer_id INT NULL,
    decision ENUM('pending','approved','changes_requested') NOT NULL DEFAULT 'pending',
    comment TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME NULL,
    next_review_due DATE NULL,
    superseded_at DATETIME NULL,
    revision_hash CHAR(64) NOT NULL,
    submitted_snapshot JSON NOT NULL,
    KEY ix_a6_reviews_entity (entity, entity_id, id),
    KEY ix_a6_reviews_decision (decision, created_at),
    CONSTRAINT fk_a6_review_submitter FOREIGN KEY (submitted_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT fk_a6_review_reviewer FOREIGN KEY (reviewer_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE articles MODIFY COLUMN editorial_status ENUM('draft','in_review','archived','published') NULL DEFAULT NULL;
ALTER TABLE recovery_exercises MODIFY COLUMN editorial_status ENUM('draft','in_review','archived','published') NULL DEFAULT NULL;
ALTER TABLE wellbeing_activities MODIFY COLUMN editorial_status ENUM('draft','in_review','archived','published') NULL DEFAULT NULL;
ALTER TABLE meal_ideas MODIFY COLUMN editorial_status ENUM('draft','in_review','archived','published') NULL DEFAULT NULL;

CREATE TABLE clinical_publications (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entity VARCHAR(40) NOT NULL,
    entity_id INT NOT NULL,
    series_key VARCHAR(160) NOT NULL,
    review_id INT NOT NULL,
    published_by INT NULL,
    published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    next_review_due DATE NOT NULL,
    snapshot JSON NOT NULL,
    UNIQUE KEY uq_a6_publication_review (review_id),
    KEY ix_a6_publication_series (entity, series_key, id),
    KEY ix_a6_publication_due (next_review_due),
    CONSTRAINT fk_a6_publication_review FOREIGN KEY (review_id) REFERENCES content_reviews(id) ON DELETE RESTRICT,
    CONSTRAINT fk_a6_publication_publisher FOREIGN KEY (published_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
