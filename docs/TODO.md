# Build Plan — Smart Inbox Assistant

Ordered todo list. Every item ships with tests; test code lives under `tests/` and is
preserved so the whole suite runs in one go (`make test`).

## Todo

**All items delivered** - see PROPOSAL.md §7 for the phased mapping and CHANGELOG.md for commit hashes. Classification verified 6/6 correct on real GPT-4o; all 4 PDF flavors processed live; literature-screening bonus splits multi-case articles.

- [x] T0  Repo skeleton, docker-compose, env contract (no fallbacks)
- [x] T1  DB schema (Flyway V1-V6; MongoDB -> PostgreSQL in P1)
- [x] T2  AI service: PDF flavor detection + digital text + tables + per-PDF summary
- [x] T3  AI service: vision OCR (scanned/handwritten) + confidence
- [x] T4  AI service: translation (non-English) + article case isolation
- [x] T5  AI service: 4-bucket classification (multi-label)
- [x] T6  AI service: fact extraction (ICSR / PQC / MI) with per-fact source
- [x] T7  Backend: mail ingestion (IMAP) + `.eml` import endpoint + dedupe
- [x] T8  Backend: DB-status queue worker + retry/fail + timing
- [x] T9  Backend: persist AI results + audit every AI step
- [x] T10 Backend: review API (queue, detail, accept/override, complete) + audit every action
- [x] T11 Backend: `POST /api/batch/run` — batch 10-15 docs, per-doc timing report
- [x] T12 Frontend: queue screen + detail screen with source links + accept/override
- [x] T13 Sample data (synthetic) + expected labels + `outputs/*.json`
- [x] T14 README + write-up + architecture diagram + screen recording
- [x] T15 (bonus) Literature screening endpoint reusing T2/T4/T6 - VERIFIED live (2-case split)

## Test cases (happy path) — preserved in `tests/`

| ID | Fixture | Asserts |
|----|---------|---------|
| TC1  | email_icsr_full.eml | bucket=ICSR, conf>=0.7; patient/product/reaction/severity filled; source=email |
| TC2  | email + pdf_report_digital.pdf | flavor=DIGITAL; facts sourced to `pdf#page`; lab table -> structured rows |
| TC3  | email + pdf_scanned_form.pdf | flavor=SCANNED; ocr_confidence<1.0; >=1 image flagged needs_human_review |
| TC4  | email + pdf_article_singlecase.pdf | flavor=ARTICLE; references excluded; ICSR if identifiable patient |
| TC5  | email + pdf_case_de.pdf | language=de; original_text retained; classified on translation |
| TC6  | email_mi_only.eml | bucket=MI only; question(s)+product extracted; no ICSR facts |
| TC7  | email_pqc_only.eml | bucket=PQC; batch/lot extracted; defect described; photo_mentioned=false |
| TC8  | email_marketing.eml | bucket=NOT_RELEVANT, conf>=0.7; no facts |
| TC9  | email_reaction_from_defect.eml | buckets = {ICSR, PQC} |
| TC10 | email + report.docx | .docx -> attachment.processed=0, skip_reason set; email still processed |
| TC11 | email_vague.eml | bucket=ICSR low conf; most fields "Not stated" |
| TC12 | pdf_article_twocases.pdf (batch) | 2 case records split out (bonus path) |

## Edge cases — preserved in `tests/`

| ID | Scenario | Expected behaviour |
|----|----------|--------------------|
| EC1  | Same Message-ID delivered twice | second ingest is a no-op (dedupe) |
| EC2  | Empty body, all content in PDF | message still processed from PDF context |
| EC3  | Corrupt / 0-byte / password-protected PDF | message -> FAILED with error_detail; queue not blocked |
| EC4  | PDF page 1 digital, pages 2-3 scanned | flavor=MIXED; per-page handling |
| EC5  | Article with no identifiable patient | NOT_RELEVANT with reason |
| EC6  | Non-English AND handwritten | OCR then translate; compounded low confidence |
| EC7  | Model returns invalid JSON | one retry, then step fails cleanly + raw logged to audit |
| EC8  | Conflicting age email(54) vs pdf(45) | both kept with sources; mismatch noted in narrative |
| EC9  | Fatal outcome, word "serious" absent | severity.seriousness_criteria = death |
| EC10 | Multiple products / reactions | arrays, not single values |
| EC11 | Reviewer overrides then reverts | both actions in audit_event, timestamped |
| EC12 | AI service down during worker run | message stays NEW after max attempts -> FAILED; retried on recovery |
| EC13 | Worker picks same row twice (concurrency) | FOR UPDATE SKIP LOCKED prevents double-processing |
| EC14 | Huge PDF (100+ pages) | page cap enforced; partial result flagged |

## Follow-ups

- [ ] **Edit résumé** — `frontend/src/assets/Priyansh_Srivastava_Resume.pdf` is
  currently just a copy of `Priyansh_Srivastava_exp.pdf`. Update the content
  (roles, dates, this project) and replace the file with the same name; the
  top-bar "Résumé" link (`frontend/src/app/app.component.ts`) points at
  `/assets/Priyansh_Srivastava_Resume.pdf`.

- [ ] **Frontend unit tests** — no test runner is set up (no karma/jest, no
  `.spec.ts`). The pure helpers added in the UI pass are unit-testable in
  isolation and should get coverage when a runner is added:
  `sender.util.parseSender`, `fact-fields.editorFor` / `isLongText`,
  `glossary.glossaryKey` / `glossaryLookup`, `queue.component` confidence
  banding. Manual checklist below stands in until then.

## Frontend UI review pass (client-friendly queue + detail)

Manual test checklist — run against a seeded stack (`make seed LOCAL=1`).

| ID | Check | Expected |
|----|-------|----------|
| UI-Q1 | Open `/` | Header shows Clinevo logo + "Built by Priyansh Srivastava" with LinkedIn \| GitHub \| Résumé |
| UI-Q2 | Queue table | No internal-id or processing-ms columns; From shows name + email on two lines |
| UI-Q3 | Category chips | ICSR=red "Safety report", PQC=amber "Quality complaint", MI=blue "Info request", NOT_RELEVANT=grey "Not relevant" |
| UI-Q4 | Confidence column | Low/Medium/High badge (red/amber/green), not a decimal; tooltip gives the % and advice |
| UI-Q5 | Confidence filter | Segmented Any/Low/Medium/High; picking one narrows the list and resets to page 1 |
| UI-Q6 | Click a row anywhere | Navigates to that message; the "Open" button also works and does not double-fire |
| UI-Q7 | Pagination | 10 rows per page; "Page 1 of N"; Prev disabled on page 1, Next disabled on last |
| UI-Q8 | Filter change | Always jumps back to page 1; 5s auto-refresh keeps the current page |
| UI-Q9 | Tooltips | Hover/focus/tap a `.term` or chip shows a dark bubble, never clipped by the table |
| UI-D1 | Open a message | "Back to queue" is a button; From shows name + email on two lines |
| UI-D2 | Facts table | Grouped by source (email body / each PDF / cross-doc), ordered Patient→Reporter→Product→Reaction→Severity→Narrative |
| UI-D3 | Long fact (narrative) | Renders as a full-width textarea row, not squeezed into one cell |
| UI-D4 | Deterministic fields | sex/gender/route/outcome = dropdown; age = number 0–150; true/false + yes/no = tri-state select; current AI value stays selectable |
| UI-D5 | Scanned PDF image flag | Reads "Scanned / handwritten page … needs a human check", not "image flagged for review" |
| UI-D6 | UID line | Shows email UID, else Message-ID, else `#id` — never blank |

Edge cases covered by the checklist:

| ID | Scenario | Expected |
|----|----------|----------|
| UI-EC1 | Sender has no `<email>` (bare name or bare address) | name shown, email line hidden; never crashes |
| UI-EC2 | `minConf` is null | confidence badge shows `—`, no band class |
| UI-EC3 | Message with no categories | Category cell shows `—` |
| UI-EC4 | Filters match 0 rows | "No messages match these filters."; pager hidden |
| UI-EC5 | Only one page of results | Pager hidden entirely |
| UI-EC6 | Date-only filter (from or to alone) | Rows with no `receivedAt` are excluded when a date filter is set |
| UI-EC7 | Injection-flagged row | Red "⚑ flagged" pill with plain-language tooltip |
| UI-EC8 | Logo asset missing | `alt` text renders; layout does not collapse |
| UI-EC9 | Fact with unknown section/bucket slug | Chip/label falls back to the raw slug; no missing tooltip error |
| UI-EC10 | Reopen a message within 15s | Served from the in-memory cache (see console log), no refetch; a write invalidates it |

## Rollback

Each todo item = one commit. Hashes recorded in `docs/CHANGELOG.md`.
