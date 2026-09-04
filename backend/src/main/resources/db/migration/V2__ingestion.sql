-- P2: ingestion hardening - IMAP UID cursor, attachment size, email UID on message.

ALTER TABLE message   ADD COLUMN email_uid  TEXT;
ALTER TABLE attachment ADD COLUMN size_bytes BIGINT;

CREATE TABLE mailbox_cursor (
    folder       TEXT PRIMARY KEY,
    uid_validity BIGINT NOT NULL DEFAULT 0,
    last_uid     BIGINT NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
