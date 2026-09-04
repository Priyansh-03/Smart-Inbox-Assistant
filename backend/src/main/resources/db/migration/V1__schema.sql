-- P1: PostgreSQL schema, 1:1 with the prior document model. Extra tables (ai_call,
-- reviewer_action, evidence) are introduced in later deltas, not here.

CREATE TABLE message (
    id              BIGSERIAL PRIMARY KEY,
    message_id_hdr  TEXT UNIQUE,
    sender          TEXT,
    subject         TEXT,
    received_at     TIMESTAMPTZ,
    body_text       TEXT,
    status          TEXT NOT NULL DEFAULT 'NEW',
    attempts        INT  NOT NULL DEFAULT 0,
    processing_ms   BIGINT,
    error_detail    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attachment (
    id            BIGSERIAL PRIMARY KEY,
    message_id    BIGINT NOT NULL REFERENCES message(id),
    filename      TEXT,
    mime_type     TEXT,
    storage_path  TEXT,
    processed     BOOLEAN NOT NULL DEFAULT false,
    skip_reason   TEXT
);

CREATE TABLE pdf_extraction (
    id                BIGSERIAL PRIMARY KEY,
    message_id        BIGINT NOT NULL REFERENCES message(id),
    attachment_id     BIGINT REFERENCES attachment(id),
    filename          TEXT,
    flavor            TEXT,
    language          TEXT,
    page_count        INT,
    full_text         TEXT,
    original_text     TEXT,
    ocr_confidence    NUMERIC,
    tables            JSONB,
    images            JSONB,
    summary           TEXT,
    looks_relevant    BOOLEAN,
    relevance_reason  TEXT
);

CREATE TABLE classification (
    id              BIGSERIAL PRIMARY KEY,
    message_id      BIGINT NOT NULL REFERENCES message(id),
    bucket          TEXT NOT NULL,
    applies         BOOLEAN NOT NULL,
    confidence      NUMERIC,
    reason          TEXT,
    review_status   TEXT NOT NULL DEFAULT 'AI',
    model           TEXT,
    prompt_version  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (message_id, bucket)
);

CREATE TABLE fact (
    id             BIGSERIAL PRIMARY KEY,
    message_id     BIGINT NOT NULL REFERENCES message(id),
    bucket         TEXT NOT NULL,
    section        TEXT,
    field_name     TEXT,
    field_value    TEXT,
    confidence     NUMERIC,
    source         JSONB,
    reviewed_value TEXT,
    review_status  TEXT NOT NULL DEFAULT 'AI'
);

CREATE TABLE audit_event (
    id          BIGSERIAL PRIMARY KEY,
    message_id  BIGINT REFERENCES message(id),
    actor       TEXT NOT NULL,
    action      TEXT NOT NULL,
    target      TEXT,
    old_value   TEXT,
    new_value   TEXT,
    detail_json JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_message_status   ON message (status, id);
CREATE INDEX ix_attachment_msg   ON attachment (message_id);
CREATE INDEX ix_pdf_msg          ON pdf_extraction (message_id);
CREATE INDEX ix_class_msg        ON classification (message_id);
CREATE INDEX ix_fact_msg         ON fact (message_id);
CREATE INDEX ix_audit_msg        ON audit_event (message_id, id);
