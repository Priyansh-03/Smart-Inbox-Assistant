# Write-up (draft)

Fill the `TODO` markers as the build progresses. Target length 2-5 pages.

## 1. Architecture

See the diagram in `README.md` / `docs/architecture.png`.

- **Angular** review UI: queue screen + detail screen (source-linked fields, accept/override).
- **Spring Boot** backend: mail ingestion, DB-status queue worker, review + audit API.
- **Python FastAPI** AI service: PDF understanding, classification, extraction. Stateless.
- **MongoDB**: messages, attachments, per-PDF extractions, classifications, facts, append-only audit.

Queue: a `status` field on the `message` document. The worker claims the next
`NEW` document with an atomic `findAndModify` (`NEW -> PROCESSING`), so two workers
never take the same message. Retries up to `WORKER_MAX_ATTEMPTS`, then `FAILED`.

## 2. Tech choices

| Layer | Chosen | Rationale |
|-------|--------|-----------|
| Frontend | Angular | matches Clinevo production |
| Backend | Spring Boot | matches Clinevo production |
| AI service | Python + FastAPI | vision + LLM libraries; isolated from the JVM |
| DB | **MongoDB (deviation from suggested Oracle)** | LLM output is JSON; ICSR/PQC/MI facts and the four PDF-flavor payloads are heterogeneous, so a document store removes schema migrations in a 7-day build. Persistence is isolated behind `InboxRepository`; audit integrity is enforced in one service instead of a PL/SQL package. A port back to Oracle is contained to that class. |
| AI model | OpenAI (`OPENAI_MODEL`, default `gpt-4o`) | single vision-capable model covers OCR, captioning, translation, classification, extraction; native JSON mode (`response_format=json_object`) for structured output. Trade-off: PDF/email text leaves the trust boundary - mitigated by synthetic-only data; for production, route through an enterprise/no-retention tier or a self-hosted model. |

## 3. Prompting approach

- One prompt file per step under `ai-service/prompts/`, version stamped (`PROMPT_VERSION`) onto every stored AI row.
- Strict JSON: calls use OpenAI JSON mode; output is schema-validated with Pydantic; one retry on invalid JSON, then the step fails cleanly and the raw output is logged to `audit_event`.
- "Unknown" is enforced by schema - every field is `{value, confidence, source}` and the system prompt forbids inference; missing => `"Not stated"`, confidence `0`.
- Classification is multi-label with a one-line reason per bucket; a reaction caused by a defect returns both ICSR and PQC.
- Every extracted fact carries `source = {type: email|pdf, file, page, quote}`.

## 4. Known limitations

- TODO: table-across-page-break stitching.
- TODO: deskew for badly rotated scans (currently relies on the vision model + lower confidence).
- TODO: single hard-coded reviewer id (no auth).
- TODO: article multi-case split is best-effort.

## 5. What would change for production

- MongoDB -> Oracle per Clinevo standard; `InboxRepository` is the only class to reimplement.
- In-process queue -> a real broker (Kafka/Rabbit) for horizontal scaling of the worker.
- REST between Java and Python -> gRPC.
- Per-field confidence calibration against a labelled gold set.
- Secrets from a vault, not env files; PII redaction before any external API call.
