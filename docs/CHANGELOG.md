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
