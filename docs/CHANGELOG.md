# Changelog

Each entry = one commit hash, for rollback.

| Hash | Scope | Notes |
|------|-------|-------|
| d99d540 | T0-T1 scaffold | repo skeleton, docker-compose, MongoDB init, backend + ai-service + frontend skeletons, unit tests, docs |
| cb28a5f | docs | changelog hash record |
| 3168233 | frontend | pinned package-lock.json |
| de62134 | verify | full local build green: ai-service pytest, backend `mvnw test` 3/3, `ng build` clean, `docker compose build backend` produces jar |
| a903515 | ai: OpenAI | swapped AI service from Anthropic/Claude to OpenAI (`gpt-4o`, JSON mode); llm.py, config.py, prompts unchanged, env keys `OPENAI_API_KEY`/`OPENAI_MODEL`, tests updated (10/10 green) |
| 1db0ac3 | harden | stable dedupe key + attachment path sanitisation + `HARDENING.md` |
| dfe2ac1 | docs | `PROPOSAL.md` reconciling scaffold vs the 17-section spec |
| d5ca370 | P1: DB -> PostgreSQL | MongoDB -> PostgreSQL 16. `InboxRepository` + `AuditService` on `JdbcClient`; `Documents` -> plain POJOs + `Jsonb` helper; Flyway `V1__schema.sql` (1:1 with prior model, jsonb for tables/images/source); compose `mongo:7` -> `postgres:16`. No unrelated refactor. Verified: backend 6/6 + AI 10/10 unit; Flyway clean-DB migrate; ingest -> queue -> process -> persist e2e (7 msgs, FAILED path without AI key); `FOR UPDATE SKIP LOCKED` skips locked rows (session B got id=2 while A held id=1). |
| 79f5e97 | docs | correct P1 changelog hash |
| 4d2bc5a | P2: ingestion hardening | `V2__ingestion.sql` (email_uid, attachment.size_bytes, mailbox_cursor). `MailPoller` polls by IMAP UID cursor + UIDVALIDITY reset (not the \Seen flag). `IngestionService`: multipart/alternative prefers text/plain, text/html stripped via jsoup, unreadable parts skipped; per-attachment try/catch (bad attachment logged, message still saved); size caps (`MAX_ATTACHMENT_MB`, `MAX_BODY_CHARS`) + Spring multipart limits (`MAX_IMPORT_REQUEST_MB`); `size_bytes` recorded. Backend tests 10/10 (7 ingestion + 3 worker). Verified live: V1+V2 clean migrate; imports get null email_uid; alternative body -> plaintext; dedupe on re-import; oversized/non-pdf logged not stored. IMAP UID path is code-reviewed only (no local IMAP server). |
