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
| DB | **PostgreSQL 16** (spec sanctions Oracle-preferred / PostgreSQL-acceptable) | `JSONB` for the heterogeneous AI payloads (per-PDF extraction, `fact.source`) so no schema churn; relational tables for the audit / evidence trail the spec makes first-class. Isolated behind `InboxRepository` (one class) for a contained port to Oracle. |
| AI model | OpenAI (`OPENAI_MODEL`, default `gpt-4o`) | single vision-capable model covers OCR, captioning, translation, classification, extraction; native JSON mode (`response_format=json_object`) for structured output. Trade-off: PDF/email text leaves the trust boundary - mitigated by synthetic-only data; for production, route through an enterprise/no-retention tier or a self-hosted model. |

## 3. Prompting approach

- One prompt file per step under `ai-service/prompts/`, version stamped (`PROMPT_VERSION`) onto every stored AI row.
- **Structured prompt template** per file: `ROLE` (a specific persona - "conservative pharmacovigilance triage specialist", "meticulous ICSR data-entry reviewer", "forensic transcriptionist", "certified medical translator", "literature screening reviewer") -> `TASK` -> `METHOD` -> `RULES` -> `OUTPUT` (the exact JSON shape).
- **Reasoning techniques, used only where they earn their place:**
  - Classification runs a silent **devil's-advocate** pass - for each category, argue for, then argue against, then decide on the margin - plus a few-shot block of the hard cases (reaction-from-defect, marketing that names a drug).
  - Article case identification uses **enumerate-then-prune** (tree-of-thought): list every human-subject mention, then prune to identifiable individuals with a drug and an outcome.
  - Extraction is **field-by-field with a self-check pass**: locate the exact span or return "Not stated"; then re-read and downgrade anything not directly quoted.
- Strict JSON: OpenAI JSON mode + `temperature=0` for classify/extract; Pydantic-validated; one in-loop retry on malformed JSON, then the step fails cleanly.
- Reliability wrapper: client-side RPM limiter, `tenacity` exponential backoff+jitter on 429/timeout/5xx, per-call timeout, and an in-process TTL response cache keyed by `sha256(model + prompt_version + system + user)` (Redis in production).
- Each stage is its own endpoint - `/ai/v1/pdf`, `/classify`, `/extract`, `/process` - so any stage can be exercised alone.
- "Unknown" is enforced by prompt + schema: missing field => `value:"Not stated"`, `confidence:0`, `source:null`.

## 4. Known limitations

- TODO: table-across-page-break stitching.
- TODO: deskew for badly rotated scans (currently relies on the vision model + lower confidence).
- TODO: single hard-coded reviewer id (no auth).
- TODO: article multi-case split is best-effort.

## 5. What would change for production

- PostgreSQL -> Oracle per Clinevo standard; `InboxRepository` is the only class to reimplement.
- In-process queue -> a real broker (Kafka/Rabbit) for horizontal scaling of the worker.
- REST between Java and Python -> gRPC.
- Per-field confidence calibration against a labelled gold set.
- Secrets from a vault, not env files; PII redaction before any external API call.
