CREATE TABLE food_log_saves (
    user_id INT NOT NULL,
    request_key VARCHAR(36) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    response_id INT NOT NULL,
    PRIMARY KEY (user_id, request_key),
    CONSTRAINT fk_food_log_saves_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
