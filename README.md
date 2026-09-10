# Smart Inbox Assistant

Reads incoming healthcare emails and their attachments, classifies each into
**ICSR / PQC / MI / Not Relevant**, extracts the key facts with a link back to
their exact source, and hands everything to a human reviewer to accept or override.

This README is the single project document — architecture, tech choices, the
prompting approach, and known limitations are all below.

**Author — Priyansh Srivastava**
· [priyansh.sriv03@gmail.com](mailto:priyansh.sriv03@gmail.com)
· [LinkedIn](https://www.linkedin.com/in/priyansh-srivastava-aiml-developer/)
· [GitHub](https://github.com/Priyansh-03)

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
                     │  doc understand → classify →  │  │   Angular review UI
                     │  extract  (+ guardrails, call │  │   queue + detail +
                     │  recorder)                    │  │   /literature page
                     └───────────────┬───────────────┘  │
                          OpenAI JSON mode │             │
                                     ▼                   │
                                  gpt-4o                 │
                     PostgreSQL 16  ◀── worker + review API + UI
```

**Flow.** Mail (or an `.eml` / article-PDF upload) → `ingestion` parses the MIME
tree, dedupes on `Message-ID` (or a content hash), stores the message + every
supported attachment → a row lands in the DB-backed queue (`message.status = NEW`).
A single polling worker claims the next row atomically (`… FOR UPDATE SKIP LOCKED`),
calls the Python AI service over REST, persists the result, and sets
`READY_FOR_REVIEW` (or `FAILED` after `WORKER_MAX_ATTEMPTS`). A second `@Scheduled`
reaper requeues rows stuck in `PROCESSING` past `WORKER_STUCK_SECONDS`. A reviewer
works the queue in Angular; every accept / override / edit is audited.

Each AI stage is also its own endpoint (`/ai/v1/pdf` — any supported document,
`/classify`, `/extract`, `/process`, `/literature`) so any stage can be exercised
in isolation.

---

## What it does

- **Ingest** a mailbox over IMAP (UID cursor) or `.eml` upload; parse the MIME tree
  (prefers `text/plain`, converts `text/html`), dedupe on `Message-ID` (content
  hash if absent), store every supported attachment, size-cap everything
  (`MAX_ATTACHMENT_MB`). Supported = PDF, image (jpg/jpeg/png/webp/gif/tif/tiff/bmp),
  office (docx/xlsx/pptx), text (txt/eml/html/csv/rtf/md/log/json); every other type
  gets an `attachment` row with a skip reason and is not processed.
- **Understand documents**: detect flavor and route —
  - *PDF*: `DIGITAL` / `SCANNED` / `ARTICLE` / `NON_ENGLISH` / `MIXED`. Digital →
    column-aware text + `AcroForm` (or "Label: value") field pairing. Scanned/mixed
    → per-page vision OCR with an averaged confidence score. Article → the model
    isolates the identifiable patient-case passages, dropping references/discussion.
    Non-English → detect + translate to English, keeping the original text.
    Plus: tables (pdfplumber) → row/column JSON; each embedded image → a vision
    description + a `needs_human_review` flag.
  - *Image* (`IMAGE`): the image is normalised (Pillow) and sent to the vision
    model for both an OCR transcription and a short description, with a
    `needs_human_review` flag.
  - *Office* (`OFFICE`, docx/xlsx/pptx): text via python-docx / openpyxl /
    python-pptx, and any raster image embedded in the file is captioned by the
    vision model too.
  - *Text* (`TEXT`, txt/eml/html/csv/rtf/md): decoded — HTML tags stripped, CSV
    flattened to `a | b | c` rows, `.eml` `text/plain` body pulled out.
  - Every document then gets language-detect + translate-if-needed and a short AI
    summary (relevant? why?). All flavors feed the same classify + extract path
    and are stored in one `pdf_extraction` row.
- **Classify** into ICSR / PQC / MI / Not Relevant, multi-label, with a confidence
  score + a one-line reason each.
- **Extract** the bucket-specific fields:
  - *ICSR*: patient (name, age, sex, weight, height, medical history), reporter
    (name, role, country), product (name, dose, route, start/stop date), reaction
    (reaction, onset date, outcome), 6 seriousness booleans (death,
    hospitalization, life-threatening, disability, congenital anomaly, medically
    important), and a plain-language narrative.
  - *PQC*: product name, batch/lot, defect description, packaging issue, suspected
    counterfeit, contamination, photo mentioned.
  - *MI*: product/topic, the question(s), relevant context.
  Every field is `{value, confidence, source:{type, file, page, quote}}`; absent ⇒
  `value:"Not stated"`, `confidence:null`, `source:null` — never guessed.
- **Guardrails**: untrusted content is fenced, prompt-injection attempts are
  flagged for human review, model output is re-validated against the schema.
- **Audit**: `ai_call` records model / prompt version / input hash / output / token
  usage / duration per LLM call; `audit_event` is an append-only log of every AI
  step and reviewer action.
- **Review UI** (Angular): queue with a category / confidence / sender / date /
  document filter (filters + page are kept in the URL, so "Back to queue" restores
  the view); detail screen with the email body, an attachment viewer (image inline,
  PDF/text in an iframe, a download link for office files), editable fields with
  confidence + clickable source, image flags, the AI-call trace, and the audit
  trail. Accept / override / mark reviewed. `POST /api/messages/{id}/retry`
  redrives a `FAILED` message; `POST /api/messages/{id}/reprocess` (the "Reprocess
  with AI" button) re-runs the pipeline on any message.
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
| AI service | **Python 3.12 / FastAPI** | PyMuPDF, pdfplumber, langdetect, Pillow, python-docx / openpyxl / python-pptx, the OpenAI SDK; isolated from the JVM, called over REST |
| Database | **PostgreSQL 16** — *deviation from the suggested Oracle* | The spec sanctions "Oracle preferred, PostgreSQL acceptable if explained." `JSONB` stores the heterogeneous LLM payloads (per-document extraction, `fact.source`, `ai_call.output`) with no schema churn, while relational tables carry the audit / evidence trail. Flyway migrations `V1`–`V6`. Isolated behind `InboxRepository` for a contained port back to Oracle. |
| AI model | **OpenAI `gpt-4o`** (`OPENAI_MODEL`, any model configurable) | one vision-capable model covers OCR, image captions, translation, classification, extraction; native JSON mode for structured output |
| Queue | `message.status` + one polling worker | in-process, spec-sanctioned; swap for SQS/Kafka at volume |

---

## Prompting approach

- One prompt file per step under `ai-service/prompts/` (`ocr`, `image_caption`,
  `translate`, `article_case`, `pdf_summary`, `classify`, `extract_icsr`,
  `extract_pqc`, `extract_mi`). `PROMPT_VERSION=v6` is stamped onto every stored
  `classification` and `ai_call` row for reproducibility.
- **Structured template** per prompt: `ROLE` (a specific persona — e.g.
  "conservative pharmacovigilance intake-triage specialist", "meticulous ICSR
  data-entry reviewer", "certified medical translator", "scientific-literature
  screening reviewer") → `TASK` → `METHOD` → `RULES` → `OUTPUT` (the exact JSON
  shape).
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

**Prereqs:** Docker + Docker Compose, and an OpenAI API key. Nothing is hardcoded —
every host, port and URL comes from an env file (CLI flags override). Two env files,
both git-ignored; only the `.example` templates are committed:

| File | Selected by | Copy from |
|------|-------------|-----------|
| `.env.local` | `./run.sh -local <cmd>` | `.env.local.example` (localhost values, ready to use) |
| `.env` | `./run.sh <cmd>` | `.env.example` (production values, edit the hosts) |

### Local (Docker, the normal way)

```bash
cd smart-inbox-assistant

cp .env.local.example .env.local
#   edit .env.local -> set OPENAI_API_KEY=sk-...   (only value you must fill in)

./run.sh -local up          # builds + starts postgres, ai-service, backend, frontend
./run.sh -local seed        # imports sample-data/emails/*.eml through the app
./run.sh -local report      # prints per-document processing time

./run.sh -local logs        # tail all container logs
./run.sh -local down        # stop everything
```

`make up LOCAL=1` / `make seed LOCAL=1` / `make report LOCAL=1` wrap the same commands.

Open **http://localhost:4200** — the message queue is the landing page.
**Screen article PDFs** in the toolbar opens the literature-screening page.
Backend API: `http://localhost:8080` · AI service: `http://localhost:8000/health`.

### Production

```bash
cp .env.example .env
#   edit .env -> real DB creds, mailbox creds, hostnames, OPENAI_API_KEY
./run.sh up
```

### Run one service outside Docker (host/port from the env file or CLI flags)

```bash
# AI service
cd ai-service && python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python -m app --host 0.0.0.0 --port 8000        # needs the AI_*/OPENAI_* vars exported

# Backend (needs a reachable Postgres + AI service)
cd backend && ./mvnw spring-boot:run
#   or:  java -jar target/*.jar --server.port=8080

# Frontend
cd frontend && npm ci && npm start              # ng serve on FRONTEND_PORT
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

- `emails/` — 14 `.eml` files; 6 carry a PDF attachment, 2 of those embed a real
  photo (a damaged blister, a skin rash) inside the form. `emails_extra/` (25) and
  `emails_variety/` (21) give wider category coverage.
- `pdfs/` — 17 PDFs: 5 digital forms, 2 scanned, 5 articles (incl. one 2-case and
  one no-identifiable-case), a German and a Spanish form, and 3 forms carrying an
  embedded product/rash image. `pdfs_extra/` has 15 more.
- `assets/` — `rashes.png`, `used-damaged-medicine.png`; the real photos
  `generate_pdfs.py` embeds into `pdf_icsr_rash.pdf` / `pdf_pqc_photo_real.pdf`.
- `expected/labels.json` — expected classifications.
- `outputs/*.json` — per-document extraction JSON (deliverable; regenerate by
  running `./run.sh -local seed` against a live stack, then exporting).

Regenerate the fixture corpus:

```bash
python sample-data/generate_pdfs.py            # writes pdfs/*.pdf (needs PyMuPDF)
python sample-data/generate_emails_with_pdfs.py # wraps some as attachment emails
```

---

## Configuration & data handling

Every key is documented in `.env.example` / `.env.local.example` and required —
`config.py` (`_require`) and `application.yml` (`${VAR}`) have no fallbacks, so a
missing value fails fast at startup. `.env` and `.env.local` hold real secrets and
are git-ignored; only the `.example` templates are tracked.

**Data-handling trade-off.** Email text, extracted document text and attached
images are sent to the OpenAI API for OCR, image description, translation,
classification and extraction. The corpus is synthetic, so this is acceptable for
the prototype. For production: an enterprise / no-retention API tier or a
self-hosted model, plus a PII-redaction pass before any external call.

---

## Known limitations

- Single-model, single-provider (OpenAI). No fallback provider.
- The in-process queue and polling worker are fine for a batch of 10–15 docs;
  real volume needs a broker and horizontal workers.
- Image understanding is a vision-model transcription + short description +
  `needs_human_review` flag — not diagnosis or severity grading.
- Office extraction pulls text and captions embedded raster images, but drops
  layout, styling and cell formulas. Legacy `.doc`/`.xls`/`.ppt` and other
  binaries (zip, etc.) are logged, not processed.
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
