-- P11: literature screening splits one article into multiple patient cases.
ALTER TABLE fact ADD COLUMN case_label TEXT;   -- NULL for mailbox-sourced facts
