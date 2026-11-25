-- Apply only after backup verification and with Google identity writers paused.
-- Preflight: reject any non-Mother users with a non-NULL legacy google_subject.
CREATE TABLE google_identities (
  subject VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mother_id INT NULL,
  admin_id INT NULL,
  PRIMARY KEY (subject),
  CONSTRAINT uq_google_identity_mother UNIQUE (mother_id),
  CONSTRAINT uq_google_identity_admin UNIQUE (admin_id),
  CONSTRAINT ck_google_identity_one_owner CHECK ((mother_id IS NULL) <> (admin_id IS NULL)),
  CONSTRAINT fk_google_identity_mother FOREIGN KEY (mother_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_google_identity_admin FOREIGN KEY (admin_id) REFERENCES admin_users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Preserve existing subject ownership without altering users or admin_users.
INSERT INTO google_identities (subject, mother_id)
SELECT google_subject, id FROM users WHERE role = 'MOTHER' AND google_subject IS NOT NULL;
