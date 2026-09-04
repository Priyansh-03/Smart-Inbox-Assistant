# Proposal — reconciled against the detailed spec

Read with `docs/HARDENING.md` (coverage matrix) and `docs/writeup.md`.
This maps the **current scaffold** onto the expanded 17-section spec and states
what changes.

---

## 0. Current state (already built and green)

| Area | Status |
|---|---|
| Repo, docker-compose, `.env` contract (no fallbacks), Makefile | ✅ |
| Spring Boot: IMAP poll + `.eml` import, dedupe, DB-status queue worker, retry→FAILED, review + batch API, PDF stream | ✅ compiles, 6/6 unit tests |
| Python FastAPI: flavor detection, digital text, tables, images, OCR/translate/article prompts, classify, ICSR/PQC/MI extraction, per-fact source | ✅ 10/10 unit tests |
| Angular: queue screen + detail screen (source links, editable fields, accept/override) | ✅ builds |
| AI model | OpenAI `gpt-4o`, JSON mode |
| Persistence | **PostgreSQL 16** (migrated from MongoDB in P1 — see §1, done) |

---

## 1. Database — RESOLVED (done in P1)

The spec (§15) sanctions **Oracle (preferred)** or **PostgreSQL (acceptable, if explained)**.
MongoDB was not in that set, so P1 migrated to **PostgreSQL 16**. Rationale kept below.
- Keeps the schema-flexibility we wanted: `JSONB` columns for the heterogeneous
  AI payloads (per-PDF extraction, seriousness block, raw model output).
- Queue stays a `status` column claimed with `SELECT … FOR UPDATE SKIP LOCKED`
  — textbook, same guarantee as before.
- Relational integrity for the audit / evidence tables the spec now makes
  first-class (§8, §9).
- One class to rewrite: `InboxRepository`. Swap `spring-boot-starter-data-mongodb`
  → `spring-boot-starter-jdbc` + `postgresql` + Flyway; `db/init/*.js` →
  `db/migration/V1__*.sql`. Docker image `mongo:7` → `postgres:16`.

Done: `InboxRepository` + `AuditService` on `JdbcClient`, `Documents` -> POJOs,
Flyway `V1__schema.sql`, compose `postgres:16`. Verified — backend 6/6 + AI 10/10
unit, Flyway clean migrate, ingest->queue->process->persist e2e, `FOR UPDATE SKIP
LOCKED` proven.

---

## 2. Target architecture (unchanged in shape)

```
Angular (nginx)  --REST-->  Spring Boot  --REST-->  Python FastAPI  -->  OpenAI
                                |                          |
                                v                          |
                          PostgreSQL  <--------------------- (results persisted by Spring)
```

- In-process queue = `message.status` + a polling worker (`@Scheduled`). Spec §11 allows this.
- REST between every hop. No broker.
- Each stage runnable/testable alone (§16, §"every major stage"):
  - ingestion: `POST /api/import/eml` or `eml-dir` — no AI needed
  - PDF processing: `POST /ai/v1/pdf` on the Python service — bytes in, structured JSON out
  - classification: `POST /ai/v1/classify`
  - extraction: `POST /ai/v1/extract`
  - full pipeline: `POST /ai/v1/process` (calls the three above)
  - review: `GET/PATCH /api/messages/**`
  - benchmark: `POST /api/batch/run` + `GET /api/batch/report`

---

## 3. Database schema (PostgreSQL)

```
message(
  id BIGSERIAL PK,
  email_uid TEXT,                    -- IMAP UID / import id
  message_id_hdr TEXT UNIQUE,        -- dedupe key (real Message-ID or sha256 fallback)
  sender TEXT, subject TEXT, received_at TIMESTAMPTZ, body_text TEXT,
  status TEXT NOT NULL DEFAULT 'NEW',-- NEW|PROCESSING|READY_FOR_REVIEW|REVIEWED|FAILED
  attempts INT NOT NULL DEFAULT 0,
  processing_started_at TIMESTAMPTZ, processing_ended_at TIMESTAMPTZ, processing_ms BIGINT,
  error_detail TEXT,
  version INT NOT NULL DEFAULT 0,    -- optimistic lock for concurrent reviewers
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)

attachment(
  id BIGSERIAL PK, message_id BIGINT FK,
  filename TEXT, mime_type TEXT, size_bytes BIGINT, storage_path TEXT,
  processed BOOLEAN NOT NULL DEFAULT false, skip_reason TEXT
)

pdf_extraction(
  id BIGSERIAL PK, message_id BIGINT FK, attachment_id BIGINT FK, filename TEXT,
  flavor TEXT,                       -- DIGITAL|SCANNED|ARTICLE|NON_ENGLISH|MIXED
  language TEXT, page_count INT, truncated BOOLEAN,
  full_text TEXT, original_text TEXT, ocr_confidence NUMERIC,
  tables JSONB, images JSONB,        -- [{page, rows}], [{page, description, kind, needs_human_review}]
  summary TEXT, looks_relevant BOOLEAN, relevance_reason TEXT
)

classification(
  id BIGSERIAL PK, message_id BIGINT FK,
  category TEXT NOT NULL,            -- ICSR|PQC|MI|NOT_RELEVANT
  applies BOOLEAN NOT NULL, confidence NUMERIC, reason TEXT,
  review_status TEXT NOT NULL DEFAULT 'AI',   -- AI|ACCEPTED|OVERRIDDEN
  ai_call_id BIGINT FK, created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, category)
)

fact(
  id BIGSERIAL PK, message_id BIGINT FK,
  category TEXT NOT NULL, section TEXT NOT NULL, field_name TEXT NOT NULL,
  value TEXT,                        -- "Not stated" when absent
  confidence NUMERIC,               -- NULL when absent (spec §8)
  source JSONB,                     -- {document, page, text} or NULL
  reviewed_value TEXT, review_status TEXT NOT NULL DEFAULT 'AI',
  ai_call_id BIGINT FK
)

ai_call(                            -- spec §9, first-class AI decision log
  id BIGSERIAL PK, message_id BIGINT FK,
  step TEXT NOT NULL,               -- ocr|translate|article|summary|classify|extract_icsr|...
  model TEXT, prompt_version TEXT,
  input_ref JSONB,                  -- {attachment_id, page} / {kind:'email'}
  input_hash TEXT,                  -- sha256 of the exact prompt (cache key + reproducibility)
  output JSONB, usage JSONB,        -- {prompt_tokens, completion_tokens}
  confidence NUMERIC,
  started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, duration_ms BIGINT,
  error TEXT
)

reviewer_action(                    -- spec §9
  id BIGSERIAL PK, message_id BIGINT FK, reviewer_id TEXT NOT NULL,
  action TEXT NOT NULL,             -- classification_accept|classification_override|fact_edit|complete
  target TEXT,                      -- category or fact id
  previous_value TEXT, new_value TEXT, reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)

ai_cache(                           -- hash -> response, TTL via created_at + sweeper
  input_hash TEXT PRIMARY KEY, step TEXT, model TEXT,
  response JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

`ai_call` and `reviewer_action` are **append-only** (enforced by a DB role with no
UPDATE/DELETE on them). `fact.source` and `classification`/`fact` output shapes
match the spec's evidence JSON exactly.

---

## 4. API contracts

### Spring ⇄ Angular
| Method | Path | Body / returns |
|---|---|---|
| GET | `/api/messages?status=&category=` | queue rows: `{id, sender, subject, receivedAt, status, categories[], minConfidence, processingMs}` |
| GET | `/api/messages/{id}` | `{message, pdfExtractions[], classifications[], facts[], aiCalls[], reviewerActions[]}` |
| GET | `/api/attachments/{messageId}/{filename}` | PDF stream (`#page=N` supported by viewer) |
| PATCH | `/api/messages/{id}/classification` | `{category, applies, reason?}` → writes `reviewer_action` |
| PATCH | `/api/messages/{id}/facts` | `[{factId, value}]` → `reviewer_action` per edit |
| POST | `/api/messages/{id}/complete` | status → REVIEWED |
| POST | `/api/messages/{id}/retry` | FAILED → NEW |
| POST | `/api/import/eml` \| `/eml-dir` | multipart / `{path}` → `[messageId]` |
| POST | `/api/batch/run` | `{dir}` → imports + returns ids |
| GET | `/api/batch/report` | `{total, processed, avgMs, rows:[{id, subject, status, startedAt, endedAt, ms, categories}]}` |
| POST | `/api/literature/upload` | multipart article PDFs → `[caseRecordId]` (bonus, §14) |

### Spring ⇄ Python  (`AI_SERVICE_URL`)
```
POST /ai/v1/process
  { message_id, email:{from,subject,received_at,body}, pdfs:[{filename, base64}] }
  → { message_id, model, prompt_version, latency_ms:{...},
      pdfs:[PdfResult], classifications:[{category,applies,confidence,reason}],
      facts:[{category,section,field_name,value,confidence,source}],
      ai_calls:[{step,model,prompt_version,input_ref,input_hash,output,usage,duration_ms,error}] }

POST /ai/v1/pdf       { filename, base64 }            → PdfResult
POST /ai/v1/classify  { email, pdf_summaries[] }      → { classifications[], ai_call }
POST /ai/v1/extract   { category, context_chunks[] }  → { facts[], ai_call }
GET  /health
```
`PdfResult = { filename, flavor, language, page_count, truncated, full_text,
original_text?, ocr_confidence?, tables[], images[], summary, looks_relevant,
relevance_reason }`

Pydantic validates every request and every model response; invalid model JSON →
one retry → `ai_call.error` set, step returns a typed failure, worker decides
retry vs FAIL.

---

## 5. Processing pipeline (stages, each independently runnable)

1. **Ingest** — IMAP UID scan or `.eml` import → `message` + `attachment` rows; non-PDF → `skip_reason`; dedupe on `message_id_hdr`.
2. **Claim** — worker `UPDATE … WHERE status='NEW' … FOR UPDATE SKIP LOCKED`, set `PROCESSING`, `processing_started_at`, `attempts++`.
3. **Per PDF**: flavor-detect → route (digital text / vision OCR+confidence / de-column+article-case / detect+translate keeping `original_text`) → tables (pdfplumber) → images (caption + `needs_human_review`) → 10–15 sentence summary. Every model call writes an `ai_call`.
4. **Classify** — email + PDF summaries → 4-category multi-label with confidence + reason.
5. **Extract** — for each applicable category, ICSR / PQC / MI schema; every field `{value, confidence, source:{document,page,text}}`; absent → `value:"Not stated", confidence:null, source:null`.
6. **Persist** — Spring writes `pdf_extraction`, `classification`, `fact`, `ai_call`; sets `processing_ended_at`, `processing_ms`, status `READY_FOR_REVIEW`. Transient AI failure → requeue without consuming an attempt; permanent → `FAILED` (+ `/retry`).
7. **Review** — Angular; every accept/override/edit writes `reviewer_action`; `complete` → `REVIEWED`.
8. **Reaper** — `@Scheduled` requeues `PROCESSING` older than the visibility timeout.

---

## 6. Deltas from the current scaffold

| # | Change | Spec ref |
|---|---|---|
| D1 | MongoDB → PostgreSQL (JSONB), Flyway migrations | §15 |
| D2 | New `ai_call` table + write one per model call (model, prompt version, input hash, output, usage, duration, error) | §9 |
| D3 | New `reviewer_action` table (previous vs new classification, optional reason) — split from generic audit | §9 |
| D4 | Evidence shape: `confidence: null` (not 0) and `source: null` when absent; `source.text` = evidence snippet | §8 |
| D5 | Seriousness → 6 explicit booleans (death, hospitalization, life-threatening, disability/incapacity, congenital anomaly, medically important event) | §5 |
| D6 | PQC extraction adds: packaging issue, suspected counterfeit, contamination as distinct fields | §6 |
| D7 | MI extraction adds explicit `relevant_context` field | §7 |
| D8 | `message`: `processing_started_at` / `processing_ended_at` timestamps (not just ms) | §13 |
| D9 | `message.version` optimistic lock; `/api/messages/{id}/retry` | hardening |
| D10 | Split AI service into `/ai/v1/pdf`, `/classify`, `/extract`, `/process` so stages run alone | §16 |
| D11 | `ai_cache` table + hash-keyed caching for LLM/OCR/translate | hardening |
| D12 | Rate-limit + backoff (`tenacity`) + `temperature=0` for classify/extract | hardening |
| D13 | Sample corpus: 10 emails + 5 digital + 2 scanned + 5 article + 2 non-English (DE+ES) + 2 PQC + 2 MI + 1 irrelevant; incl. multi-case article, tables, images, missing-info, ICSR+PQC | §12 |
| D14 | `sample-data/outputs/*.json` generated by the batch run; benchmark table in the write-up | §13, §17 |
| D15 | Literature screening upload flow reusing article + extract logic | §14 |

---

## 7. Implementation plan (follows spec §16 priority)

| Step | Deliverable | Runnable check |
|---|---|---|
| P1 | **DB swap** to Postgres + Flyway + all tables above | `make up`; `\dt` shows schema; backend boots |
| P2 | Ingestion solid: IMAP UID tracking, MIME edge cases, size caps, `.eml` import | `POST /api/import/eml-dir` → rows in `message`/`attachment` |
| P3 | AI service split endpoints + Pydantic schemas + cache + rate-limit | `curl /ai/v1/pdf` with a sample PDF |
| P4 | PDF processing: digital form fields (`page.widgets()`), OCR confidence, article de-column, DE/ES translate + `original_text` | per-flavor unit tests on synthetic PDFs |
| P5 | Classification 4-way multi-label + `ai_call` logging | `curl /ai/v1/classify`; row in `ai_call` |
| P6 | ICSR/PQC/MI extraction with exact evidence schema (D4–D7) | `curl /ai/v1/extract`; facts carry `source{document,page,text}` |
| P7 | Worker wires it all: timestamps, reaper, retry, persistence | import 1 email → `READY_FOR_REVIEW` with facts |
| P8 | Review UI: all spec §10 fields, accept/override, image flags, `reviewer_action` | click through in browser |
| P9 | Synthetic corpus (D13) + `POST /api/batch/run` + `outputs/*.json` | `make seed && make report` |
| P10 | Docs: architecture diagram, 2–5 page write-up, screenshots, benchmark table | files in `docs/` |
| P11 | Bonus: `/api/literature/upload` + multi-case split | upload multi-case article → N case records |

Each step = one commit, hash recorded in `docs/CHANGELOG.md`.
