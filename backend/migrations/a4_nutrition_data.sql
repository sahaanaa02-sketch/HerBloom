ALTER TABLE foods
    ADD COLUMN source_ref VARCHAR(250) NULL DEFAULT NULL,
    ADD COLUMN carbs_g FLOAT NULL DEFAULT NULL,
    ADD COLUMN fat_g FLOAT NULL DEFAULT NULL,
    ADD COLUMN fibre_g FLOAT NULL DEFAULT NULL,
    ADD COLUMN folate_ug FLOAT NULL DEFAULT NULL,
    ADD COLUMN vitamin_c_mg FLOAT NULL DEFAULT NULL,
    ADD COLUMN tags JSON NULL,
    ADD COLUMN missing_nutrients JSON NULL,
    ADD UNIQUE KEY uq_a4_food_source_ref (source, source_ref);

ALTER TABLE food_aliases
    ADD COLUMN lang ENUM('en','ta','local') NULL DEFAULT NULL;

CREATE TABLE unmatched_food_names (
    id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    count INT NOT NULL,
    last_seen DATETIME NOT NULL,
    resolved TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_unmatched_food_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE nutrition_target_values (
    id INT NOT NULL AUTO_INCREMENT,
    feeding_group ENUM('breastfeeding','not_breastfeeding') NOT NULL,
    nutrient ENUM('calories','protein','carbs_g','fat_g','fibre_g','iron','calcium','folate_ug','vitamin_c_mg') NOT NULL,
    value FLOAT NOT NULL,
    unit VARCHAR(10) NOT NULL,
    source_note VARCHAR(1000) NOT NULL,
    status ENUM('draft','in_review','approved') NOT NULL,
    reviewed_by INT NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_nutrition_target_value (feeding_group, nutrient),
    CONSTRAINT fk_nutrition_target_value_reviewer FOREIGN KEY (reviewed_by) REFERENCES admin_users (id) ON DELETE SET NULL,
    CONSTRAINT ck_nutrition_target_value_positive CHECK (value > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
