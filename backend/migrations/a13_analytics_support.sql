CREATE TABLE mother_engagement (
    user_id INT NOT NULL,
    activity_day DATE NOT NULL,
    feature ENUM('login','article','scan','chat') NOT NULL,
    resource_id INT NOT NULL DEFAULT 0,
    hits INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, activity_day, feature, resource_id),
    KEY ix_engagement_day (activity_day, feature, resource_id),
    CONSTRAINT fk_engagement_mother FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE support_tickets (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    subject VARCHAR(160) NOT NULL,
    message TEXT NOT NULL,
    category ENUM('account','technical','billing','feedback','other') NOT NULL,
    status ENUM('open','pending','closed') NOT NULL DEFAULT 'open',
    assignee_admin_id INT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    KEY ix_tickets_inbox (status, category, id),
    KEY ix_tickets_mother (user_id, id),
    CONSTRAINT fk_ticket_owner FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_assignee FOREIGN KEY (assignee_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_replies (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    admin_id INT NULL,
    body TEXT NOT NULL,
    created_at DATETIME(6) NOT NULL,
    KEY ix_replies_thread (ticket_id, id),
    CONSTRAINT fk_reply_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_reply_admin FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE faqs (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    question_en VARCHAR(240) NOT NULL,
    question_ta VARCHAR(240) NOT NULL,
    answer_en TEXT NOT NULL,
    answer_ta TEXT NOT NULL,
    category VARCHAR(60) NOT NULL,
    sort_order INT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('draft','published') NOT NULL DEFAULT 'draft',
    KEY ix_faq_public (status, sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
