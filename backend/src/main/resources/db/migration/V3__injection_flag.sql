-- P3.5: surface prompt-injection detection from the AI service to the reviewer.

ALTER TABLE message        ADD COLUMN injection_flagged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE message        ADD COLUMN injection_notes   TEXT;
ALTER TABLE pdf_extraction ADD COLUMN injection_flagged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pdf_extraction ADD COLUMN injection_notes   TEXT;

CREATE INDEX ix_message_injection ON message (injection_flagged) WHERE injection_flagged;
