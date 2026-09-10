# Smart Inbox Assistant

Reads incoming healthcare emails and PDF attachments, classifies each into
**ICSR / PQC / MI / Not Relevant**, extracts the key facts with a link back to
their exact source, and hands everything to a human reviewer to accept or override.

This README is the single project document — architecture, tech choices, the
prompting approach, and known limitations are all below.

---

## Architecture

```
Test mailbox (IMAP)  ─poll by UID─┐
.eml / article-PDF upload  ────────┤
                                   ▼
                     ┌───────────────────────────────┐
                     │  Spring Boot backend          │
                     │  ingest → message.status queue│
                     │  → polling worker → review API│
                     └───────────────┬───────────────┘
                        REST /ai/v1/process │           ▲ REST
                                     ▼                  │
                     ┌───────────────────────────────┐  │
                     │  Python FastAPI AI service    │  │
                     │  PDF understand → classify →  │  │   Angular review UI
                     │  extract  (+ guardrails, call │  │   queue + detail +
                     │  recorder)                    │  │   /literature page
                     └───────────────┬───────────────┘  │
                          OpenAI JSON mode │             │
                                     ▼                   │
                                  gpt-4o                 │
                     PostgreSQL 16  ◀── worker + review API + UI
```

**Flow.** Mail (or an `.eml` / article-PDF upload) → `ingestion` parses the MIME
tree, dedupes on `Message-ID` (or a content hash), stores the message + PDF
attachments → a row lands in the DB-backed queue (`message.status = NEW`). A single
polling worker claims the next row atomically (`… FOR UPDATE SKIP LOCKED`), calls
the Python AI service over REST, persists the result, and sets `READY_FOR_REVIEW`
(or `FAILED` after `WORKER_MAX_ATTEMPTS`). A second `@Scheduled` reaper requeues
rows stuck in `PROCESSING` past `WORKER_STUCK_SECONDS`. A reviewer works the queue
in Angular; every accept / override / edit is audited.

Each AI stage is also its own endpoint (`/ai/v1/pdf`, `/classify`, `/extract`,
`/process`, `/literature`) so any stage can be exercised in isolation.

---

## What it does

- **Ingest** a mailbox over IMAP (UID cursor) or `.eml` upload; parse the MIME tree
  (prefers text/plain, strips HTML), dedupe on `Message-ID`, store every supported
  attachment, size-cap everything. Supported = PDF, image (jpg/png/webp/gif/tiff),
  office (docx/xlsx/pptx), text-family (txt/eml/html/csv/rtf/md); anything else is
  logged, not processed.
- **Understand documents**: detect flavor and route —
  - *PDF*: digital / scanned / article / non-English / mixed → direct text with
    column-aware ordering + form-field pairing, vision OCR with a confidence score,
    multi-column de-column + patient-case isolation, language detect + translate
    keeping the original; tables → structured rows; meaningful images → caption +
    human-review flag.
  - *Image*: vision model transcription/description + a human-review flag.
  - *Office / text*: server-side text extraction (python-docx / openpyxl /
    python-pptx; HTML stripped, CSV flattened, `.eml` body pulled).
  - Every document gets language detect + translate-if-needed and a short AI
    summary saying whether it looks relevant and why. All of it feeds the same
    classify + extract path as PDFs.
- **Classify** into ICSR / PQC / MI / Not Relevant, multi-label, with a confidence
  score + a one-line reason each.
- **Extract** ICSR (patient / reporter / product / reaction / 6 seriousness
  booleans / narrative), PQC (product, batch/lot, defect, counterfeit,
  contamination, photo), MI (product, questions, context). Every field is
  `{value, confidence, source{document, page, evidence}}`; absent ⇒ `"Not stated"`,
  `null`, `null` — never guessed.
- **Guardrails**: untrusted content is fenced, prompt-injection attempts are
  flagged for human review, model output is re-validated against the schema.
- **Audit**: `ai_call` records model / prompt version / input hash / output / token
  usage / duration per LLM call; `audit_event` is an append-only log of every AI
  step and reviewer action.
- **Review UI** (Angular): queue with injection badges; detail screen with the
  email + PDF viewer, editable fields with confidence + clickable source, image
  flags, the AI-call trace, and the audit trail. Accept / override / mark reviewed;
  `/retry` redrives a FAILED message.
- **Batch**: `GET /api/batch/report` gives per-document timing.
- **Bonus — literature screening** (`/literature` review page +
  `POST /api/literature/upload`): upload article PDFs independently of the mailbox;
  each is screened for real, identifiable individual patient cases, multiple cases
  are split out of one article, and a summary + relevance reason is produced per
  article and per case. It reuses the PDF-understanding, `article_case`, and ICSR
  extraction logic, and each screened article is stored as a message so the normal
  detail screen renders it (facts grouped by `case_label`). The page shows a live
  per-step pipeline (Reading the PDF → Finding patient cases → Extracting ICSR
  facts → Summary & relevance) while the upload is analysed.

---

## Tech choices

| Layer | Choice | Rationale / deviation |
|---|---|---|
| Frontend | **Angular 18** (standalone components) | matches Clinevo production |
| Backend | **Spring Boot 3.3 / Java 21**, `JdbcClient` (not JPA) | hand-written SQL keeps the one persistence seam (`InboxRepository`) explicit and swappable |
| AI service | **Python 3.12 / FastAPI** | PyMuPDF, pdfplumber, langdetect, the OpenAI SDK; isolated from the JVM, called over REST |
| Database | **PostgreSQL 16** — *deviation from the suggested Oracle* | The spec sanctions "Oracle preferred, PostgreSQL acceptable if explained." `JSONB` stores the heterogeneous LLM payloads (per-PDF extraction, `fact.source`, `ai_call.output`) with no schema churn, while relational tables carry the audit / evidence trail. Flyway migrations `V1`–`V6`. Isolated behind `InboxRepository` for a contained port back to Oracle. |
| AI model | **OpenAI `gpt-4o`** (`OPENAI_MODEL`, any model configurable) | one vision-capable model covers OCR, image captions, translation, classification, extraction; native JSON mode for structured output |
| Queue | `message.status` + one polling worker | in-process, spec-sanctioned; swap for SQS/Kafka at volume |

---

## Prompting approach

- One prompt file per step under `ai-service/prompts/`, version-stamped
  (`PROMPT_VERSION=v6`) onto every stored `classification` / `fact` / `ai_call` row.
- **Structured template** per prompt: `ROLE` (a specific persona — e.g.
  "conservative pharmacovigilance triage specialist", "meticulous ICSR data-entry
  reviewer", "certified medical translator", "literature screening reviewer") →
  `TASK` → `METHOD` → `RULES` → `OUTPUT` (the exact JSON shape).
- **Reasoning techniques, only where they earn their place:**
  - Classification runs a silent **devil's-advocate** pass plus a few-shot block of
    the hard cases (reaction-from-defect → both ICSR + PQC; marketing that names a
    drug → NOT_RELEVANT).
  - Article case identification uses **enumerate-then-prune**: list every
    human-subject mention, then keep only identifiable individuals with a drug and
    an outcome.
  - Extraction works **field by field with a self-check** re-read; unsupported
    values are downgraded to "Not stated".
- **JSON mode + schema re-validation.** Every model response is parsed as JSON and
  re-checked by `validators.py` (unknown buckets/sections dropped, bad
  `source.type` cleared, confidence clamped) before it is persisted.

---

## Run it

Prereqs: Docker + Docker Compose. **No setting is hardcoded** — every host, port and
URL is read from an env file (CLI flags override). Two files, both git-ignored once
they hold real secrets; only the `.example` templates are tracked:

| File | Used by | Create it from |
|------|---------|----------------|
| `.env.local` | `./run.sh -local ...` | `.env.local.example` (localhost values) |
| `.env` | `./run.sh ...` (default) | `.env.example` (production values) |

```bash
# local
cp .env.local.example .env.local && $EDITOR .env.local   # add OPENAI_API_KEY
./run.sh -local up              # postgres + ai-service + backend + frontend
./run.sh -local seed            # push the sample emails through
./run.sh -local report          # per-document timing

# production
cp .env.example .env && $EDITOR .env
./run.sh up
```

`make up` / `make up LOCAL=1` wrap the same thing.

- UI: `http://<FRONTEND_HOST>:<FRONTEND_PORT>` — the queue is the landing page;
  **Screen article PDFs** in the toolbar opens the `/literature` page.
- Backend: `http://<SERVER_HOST>:<SERVER_PORT>`
- AI service: `http://<AI_HOST>:<AI_PORT>`

Feed the sample batch without a live mailbox:

```bash
API_BASE_URL=http://localhost:8080 make seed
API_BASE_URL=http://localhost:8080 make report   # per-document timing
```

### Run a service on its own (host/port from env or CLI)

```bash
# AI service
cd ai-service && . .venv/bin/activate && python -m app --host 0.0.0.0 --port 8000

# Backend
cd backend && ./mvnw spring-boot:run           # or: java -jar target/*.jar --server.port=8080
```

---

## Tests

```bash
make test-ai       # AI-service unit tests, no network
make test-backend  # backend unit tests, JDK 21
./run.sh -local up && ./run.sh -local test-e2e   # end-to-end against the live stack
```

---

## Synthetic test data

All data is fictional. `sample-data/` holds:

- `emails/` — 14 `.eml` files (several carry a PDF attachment, including two whose
  attached form embeds a real photo — a damaged blister and a skin rash — from
  `sample-data/assets/`), plus `emails_extra/` and `emails_variety/` for wider
  category coverage.
- `pdfs/` — 17 PDFs: 5 digital forms, 2 scanned, 5 articles (incl. one 2-case and
  one no-case), DE + ES, and 3 forms with an embedded product/rash photo.
- `assets/` — the source photos embedded into the photo fixtures.
- `expected/labels.json` — expected classifications.
- `outputs/*.json` — per-document extraction JSON (deliverable; regenerate with a
  batch run against a live stack).

Regenerate the corpus:

```bash
python sample-data/generate_pdfs.py
python sample-data/generate_emails_with_pdfs.py
```

---

## Configuration & data handling

Every key is documented in `.env.example` / `.env.local.example` and required —
`config.py` (`_require`) and `application.yml` (`${VAR}`) have no fallbacks, so a
missing value fails fast at startup. `.env` and `.env.local` hold real secrets and
are git-ignored; only the `.example` templates are tracked.

**Data-handling trade-off.** PDF and email text is sent to the OpenAI API for OCR,
translation, classification and extraction. The corpus is synthetic, so this is
acceptable for the prototype. For production: an enterprise / no-retention API tier
or a self-hosted model, plus a PII-redaction pass before any external call.

---

## Known limitations

- Single-model, single-provider (OpenAI). No fallback provider.
- The in-process queue and polling worker are fine for a batch of 10–15 docs;
  real volume needs a broker and horizontal workers.
- Image handling is a good-faith transcription/caption + human-review flag, not
  deep analysis.
- Office/text extraction is text-only (no layout, no embedded-image OCR); legacy
  `.doc`/`.xls`/`.ppt` and other binaries are logged, not processed.
- Form-field pairing is best-effort (AcroForm widgets when present, otherwise
  "Label: value" line pairing) and not persisted as structured columns.
- The literature page's step pipeline is an indicative animation over a single
  blocking call, not a real per-stage progress stream.

---

## Deliverables (assignment §7)

| # | Deliverable | Where |
|---|---|---|
| 1 | Runnable app (frontend + backend + DB) | `./run.sh -local up` |
| 2 | Source | this repo |
| 3 | README + setup + env vars | this file |
| 4 | Env var template | `.env.example`, `.env.local.example` |
| 5 | Architecture + tech choices + prompting approach | this file (above) |
| 6 | Sample extracted JSON | `sample-data/outputs/*.json` |
| 7 | Processing benchmark | `GET /api/batch/report` |
| 8 | Bonus: literature screening | `/literature` page + `POST /api/literature/upload` |
