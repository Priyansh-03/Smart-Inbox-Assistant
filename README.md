# Smart Inbox Assistant

Reads incoming healthcare emails and PDF attachments, classifies each into
**ICSR / PQC / MI / Not Relevant**, extracts the key facts with a link back to
their exact source, and hands everything to a human reviewer to accept or override.

## Architecture

```
Test mailbox (IMAP)                 Angular review UI
        |                                   |
        v                                   v
  Spring Boot backend  <---- REST ----  (queue + detail screens)
   - IMAP poll / .eml import
   - DB-status queue worker  ---- REST ----> Python AI service (FastAPI)
   - review + audit API                       - PDF flavor detection
        |                                     - OCR / translate / article
        v                                     - 4-bucket classification
     MongoDB                                  - fact extraction + sources
   messages, attachments,
   pdf_extraction, classification,
   fact, audit_event (append-only)
```

Full write-up: [`docs/writeup.md`](docs/writeup.md). Build plan and the full
test-case / edge-case matrix: [`docs/TODO.md`](docs/TODO.md).

## Run it

Prereqs: Docker + Docker Compose. Nothing is hardcoded - every setting comes from `.env`.

```bash
make env                 # writes .env from .env.example
$EDITOR .env             # fill in OPENAI_API_KEY, MAIL_* (or set MAIL_ENABLED=false)
make up                  # starts mongo + ai-service + backend + frontend
```

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
make test        # ai-service + backend unit suites
make up && cd tests/integration && python -m pytest   # end-to-end (needs API key)
```

## Configuration

Every key is documented in [`.env.example`](.env.example). Secrets that need
rotation (DB password, mail password, `OPENAI_API_KEY`) are read only from the
environment and never committed.

## Data handling

Synthetic test data only. PDF and email text is sent to the OpenAI API for
classification and extraction - see the trade-off note in `docs/writeup.md`.
