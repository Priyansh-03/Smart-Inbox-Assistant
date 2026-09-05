-- P7: explicit processing start/end timestamps (spec section 13) + stuck-message recovery.

ALTER TABLE message ADD COLUMN processing_started_at TIMESTAMPTZ;
ALTER TABLE message ADD COLUMN processing_ended_at   TIMESTAMPTZ;

-- lets the reaper find messages stuck in PROCESSING after a worker crash
CREATE INDEX ix_message_processing ON message (status, processing_started_at)
    WHERE status = 'PROCESSING';
