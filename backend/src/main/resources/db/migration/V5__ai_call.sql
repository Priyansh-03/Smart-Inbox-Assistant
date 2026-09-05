-- P5: per-LLM-call audit record (spec section 9). Append-only.

CREATE TABLE ai_call (
    id             BIGSERIAL PRIMARY KEY,
    message_id     BIGINT NOT NULL REFERENCES message(id),
    step           TEXT NOT NULL,          -- ocr | translate | article_case | pdf_summary | classify | extract_icsr | ...
    model          TEXT,
    prompt_version TEXT,
    input_hash     TEXT,                   -- sha256 of the exact prompt: cache key + reproducibility pointer
    output         JSONB,
    usage          JSONB,                  -- {prompt_tokens, completion_tokens, total_tokens}
    duration_ms    BIGINT,
    error          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_ai_call_message ON ai_call (message_id, id);
