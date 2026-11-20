ALTER TABLE meal_ideas
    ADD COLUMN title_ta VARCHAR(150) NULL DEFAULT NULL,
    ADD COLUMN description_ta TEXT NULL,
    ADD COLUMN allergens JSON NULL,
    ADD COLUMN photo_media_id INT NULL DEFAULT NULL,
    ADD COLUMN editorial_status ENUM('draft','in_review','archived') NULL DEFAULT NULL,
    ADD COLUMN created_by INT NULL DEFAULT NULL,
    ADD COLUMN updated_by INT NULL DEFAULT NULL,
    ADD COLUMN created_at DATETIME NULL DEFAULT NULL,
    ADD COLUMN updated_at DATETIME NULL DEFAULT NULL,
    ADD CONSTRAINT fk_meal_ideas_photo FOREIGN KEY (photo_media_id) REFERENCES media_files (id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_meal_ideas_created_by FOREIGN KEY (created_by) REFERENCES admin_users (id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_meal_ideas_updated_by FOREIGN KEY (updated_by) REFERENCES admin_users (id) ON DELETE SET NULL;

CREATE TABLE meal_idea_ingredients (
    meal_idea_id INT NOT NULL,
    food_id INT NOT NULL,
    grams DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (meal_idea_id, food_id),
    KEY ix_meal_idea_ingredients_food_id (food_id),
    CONSTRAINT fk_meal_idea_ingredients_meal FOREIGN KEY (meal_idea_id) REFERENCES meal_ideas (id) ON DELETE CASCADE,
    CONSTRAINT fk_meal_idea_ingredients_food FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE RESTRICT,
    CONSTRAINT ck_meal_idea_ingredients_positive_grams CHECK (grams > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
