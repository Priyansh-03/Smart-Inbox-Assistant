# Smart Inbox Assistant

Reads incoming healthcare emails and PDF attachments, classifies each into
**ICSR / PQC / MI / Not Relevant**, extracts the key facts with a link back to
their exact source, and hands everything to a human reviewer to accept or override.

Angular → Spring Boot → in-process queue → Python/FastAPI AI service → PostgreSQL.
Architecture diagram, tech-choice rationale, prompting approach and benchmark
numbers are in **[`docs/writeup.md`](docs/writeup.md)**. Build plan + the full
test-case / edge-case matrix: [`docs/TODO.md`](docs/TODO.md). Rollback log:
[`docs/CHANGELOG.md`](docs/CHANGELOG.md).

## What it does

- **Ingest** a mailbox over IMAP (UID cursor) or `.eml` upload; parse the MIME tree
  (prefers text/plain, strips HTML), dedupe on `Message-ID`, store PDF attachments,
  size-cap everything.
- **Understand PDFs**: detect flavor (digital / scanned / article / non-English /
  mixed) and route — direct text with column-aware ordering + form-field pairing,
  vision OCR with a confidence score, multi-column de-column + patient-case
  isolation, language detect + translate keeping the original. Plus tables →
  structured rows, meaningful images → caption + human-review flag, a 10–15 sentence
  summary.
- **Classify** into ICSR / PQC / MI / Not Relevant, multi-label, with confidence +
  a one-line reason each.
- **Extract** ICSR (patient / reporter / product / reaction / 6 seriousness
  booleans / narrative), PQC (product, batch/lot, defect, counterfeit,
  contamination, photo), MI (product, questions, context). Every field is
  `{value, confidence, source{document, page, evidence}}`; absent ⇒ `"Not stated"`,
  `null`, `null`.
- **Guardrails**: untrusted content is fenced, prompt-injection attempts are
  flagged for human review, model output is re-validated against the schema.
- **Audit**: `ai_call` records model / prompt version / input hash / output / token
  usage / duration per LLM call; `audit_event` is an append-only log of every AI
  step and reviewer action.
- **Review UI** (Angular): queue with injection badges; detail screen with the
  email + PDF viewer, editable fields with confidence + clickable source, image
  flags, the AI-call trace, and the audit trail. Accept / override / mark reviewed;
  `/retry` redrives a FAILED message.
- **Batch**: `POST /api/batch/report` gives per-document timing.
- **Bonus**: `POST /api/literature/upload` screens article PDFs — splits multiple
  patient cases out of one article, ICSR facts per case.

## Run it

Prereqs: Docker + Docker Compose. **No setting is hardcoded** - every host, port and
URL is read from an env file (CLI flags override it). Two files:

Both files hold real secrets (`OPENAI_API_KEY`, mailbox password) once filled in, so
**neither is tracked** - only the `.example` templates are.

| File | Used by | You create it from |
|------|---------|---------------------|
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

- UI: `http://<FRONTEND_HOST>:<FRONTEND_PORT>`
- Backend: `http://<SERVER_HOST>:<SERVER_PORT>`
- AI service: `http://<AI_HOST>:<AI_PORT>`

Feed the sample batch without a live mailbox:

```bash
API_BASE_URL=http://localhost:8080 make seed
API_BASE_URL=http://localhost:8080 make report   # per-document timing
```

## Run a service on its own (host/port from env or CLI)

```bash
# AI service
cd ai-service && . .venv/bin/activate && python -m app --host 0.0.0.0 --port 8000

# Backend
cd backend && ./mvnw spring-boot:run           # or: java -jar target/*.jar --server.port=8080
```

## Tests

```bash
make test-ai       # 39 unit tests, no network
make test-backend  # 11 unit tests, JDK 21
./run.sh -local up && ./run.sh -local test-e2e   # end-to-end against the live stack
```

## Synthetic test data

`sample-data/` holds 11 emails (4 with PDF attachments) and 14 PDFs
(5 digital forms, 2 scanned, 5 articles incl. one 2-case + one no-case, DE + ES).
Regenerate with `python sample-data/generate_pdfs.py` and
`python sample-data/generate_emails_with_pdfs.py`. Expected classifications:
`sample-data/expected/labels.json`. Per-document extraction JSON:
`sample-data/outputs/`.

## Deliverables (spec §17)

| # | Deliverable | Where |
|---|---|---|
| 1 | Runnable app (frontend + backend + DB) | `./run.sh -local up` |
| 2 | Source | this repo |
| 3 | README + setup | this file |
| 4 | Env var template | `.env.example`, `.env.local.example` |
| 5 | Architecture diagram + 2–5 page write-up | `docs/writeup.md` |
| 6 | Sample extracted JSON | `sample-data/outputs/*.json` |
| 7 | Processing benchmark | `docs/writeup.md` §5 |
| 8 | Bonus: literature screening | `POST /api/literature/upload` |

## Configuration & data handling

Every key is documented in `.env.example`. Nothing is hardcoded — host, port and
URL all come from the env file (CLI flags override). `.env` and `.env.local` hold
real secrets and are git-ignored; only the `.example` templates are tracked.
Synthetic data only; PDF/email text is sent to the OpenAI API — trade-off in
`docs/writeup.md` §2.
