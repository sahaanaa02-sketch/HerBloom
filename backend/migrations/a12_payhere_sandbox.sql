CREATE TABLE billing_orders (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    order_ref CHAR(35) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    checkout_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    merchant_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    amount_lkr DECIMAL(9,2) NOT NULL,
    currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status ENUM('pending','paid','failed','cancelled','refund_pending','refunded','chargeback') NOT NULL DEFAULT 'pending',
    review_required BOOLEAN NOT NULL DEFAULT FALSE,
    provider_payment_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
    entitlement_id INT NULL,
    created_at_utc DATETIME(6) NOT NULL,
    verified_at_utc DATETIME(6) NULL,
    UNIQUE KEY uq_billing_order_ref (order_ref),
    UNIQUE KEY uq_billing_checkout_key (user_id,checkout_key),
    UNIQUE KEY uq_billing_order_entitlement (entitlement_id),
    KEY ix_billing_orders_queue (review_required,status,id),
    CONSTRAINT ck_billing_positive_amount CHECK (amount_lkr > 0),
    CONSTRAINT fk_billing_order_account FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_billing_order_entitlement FOREIGN KEY (entitlement_id) REFERENCES entitlement_periods (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE billing_payment_events (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    source ENUM('notify','retrieval') NOT NULL,
    provider_status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    provider_payment_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    received_at_utc DATETIME(6) NOT NULL,
    UNIQUE KEY uq_payment_event (order_id,source,provider_status,provider_payment_id),
    CONSTRAINT fk_payment_event_order FOREIGN KEY (order_id) REFERENCES billing_orders (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
