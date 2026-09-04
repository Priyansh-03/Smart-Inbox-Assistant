"""Orchestrates: PDF understanding -> classification -> fact extraction."""
import base64
import logging
import time

from . import pdf_utils as pu
from .config import config
from .constants import MAX_CTX_CHARS
from .llm import ask_json, image_part, load_prompt, text_part, MODEL, PROMPT_VERSION
from .schemas import (BucketVerdict, Fact, PdfResult, ProcessRequest,
                      ProcessResponse, Source)

log = logging.getLogger("ai-service.pipeline")


def process_pdf(name: str, pdf_bytes: bytes) -> PdfResult:
    info = pu.analyse(pdf_bytes, page_cap=config.PDF_PAGE_CAP)
    flavor, lang, n = info["flavor"], info["language"], info["page_count"]
    log.info("PDF %s: flavor=%s language=%s pages=%d", name, flavor, lang, n)
    text = info["full_text"]
    original = None
    ocr_conf = None

    if flavor in (pu.FLAVOR_SCANNED, pu.FLAVOR_MIXED):
        parts, confs = [], []
        for p in info["pages"]:
            if p["scanned"]:
                png = pu.render_page_png(pdf_bytes, p["page"] - 1)
                r = ask_json(load_prompt("ocr"),
                             [image_part(png), text_part("Transcribe this page.")])
                parts.append(f"[page {p['page']}]\n{r.get('text', '')}")
                confs.append(float(r.get("confidence", 0.0)))
            else:
                parts.append(f"[page {p['page']}]\n(digital page - see full_text)")
        text = "\n".join(parts) if flavor == pu.FLAVOR_SCANNED else text + "\n" + "\n".join(parts)
        ocr_conf = round(sum(confs) / len(confs), 2) if confs else None

    if flavor == pu.FLAVOR_NON_ENGLISH or (lang not in ("en", "unknown") and flavor != pu.FLAVOR_SCANNED):
        r = ask_json(load_prompt("translate"), text[:MAX_CTX_CHARS], max_tokens=4000)
        original = text
        text = r.get("english_text", text)
        lang = r.get("language", lang)

    if flavor == pu.FLAVOR_ARTICLE:
        r = ask_json(load_prompt("article_case"), text[:MAX_CTX_CHARS], max_tokens=3000)
        if r.get("has_patient_case"):
            text = "\n\n".join(c.get("text", "") for c in r.get("cases", []))

    tables = pu.extract_tables(pdf_bytes)

    images = []
    for im in pu.list_images(pdf_bytes):
        png = pu.render_page_png(pdf_bytes, im["page"] - 1)
        cap = ask_json(load_prompt("image_caption"),
                       [image_part(png), text_part(f"Describe the notable image on page {im['page']}.")])
        images.append({"page": im["page"], "needs_human_review": True, **cap})

    summ = ask_json(load_prompt("pdf_summary"),
                    f"FILENAME: {name}\nFLAVOR: {flavor}\n\nTEXT:\n{text[:MAX_CTX_CHARS]}\n\n"
                    f"TABLES: {tables[:5]}\nIMAGES: {images}", max_tokens=1500)

    return PdfResult(
        filename=name, flavor=flavor, language=lang, page_count=n,
        full_text=text, original_text=original, ocr_confidence=ocr_conf,
        tables=tables, images=images,
        summary=summ.get("summary", ""), looks_relevant=summ.get("looks_relevant"),
        relevance_reason=summ.get("relevance_reason", ""),
    )


PROMPT_BY_BUCKET = {"ICSR": "extract_icsr", "PQC": "extract_pqc", "MI": "extract_mi"}


def classify_context(email_from: str, email_subject: str, email_body: str,
                     pdf_summaries: list[str]) -> list[BucketVerdict]:
    ctx = f"[email] from={email_from} subject={email_subject}\n{email_body}\n\n"
    for i, s in enumerate(pdf_summaries, 1):
        ctx += f"[pdf {i}] summary: {s}\n"
    r = ask_json(load_prompt("classify"), ctx[:MAX_CTX_CHARS])
    verdicts = [BucketVerdict(**v) for v in r.get("verdicts", [])]
    log.info("Classified: %s", [f"{v.bucket}={v.applies}" for v in verdicts])
    return verdicts


def classify(req: ProcessRequest, pdfs: list[PdfResult]) -> list[BucketVerdict]:
    return classify_context(req.email_from, req.email_subject, req.email_body,
                            [p.summary for p in pdfs])


def extract_from_chunks(categories: list[str], context_chunks: list[str]) -> list[Fact]:
    active = [c for c in categories if c in PROMPT_BY_BUCKET]
    if not active:
        log.info("No extractable categories, skipping fact extraction")
        return []
    ctx = "\n\n".join(context_chunks)
    facts: list[Fact] = []
    for bucket in active:
        r = ask_json(load_prompt(PROMPT_BY_BUCKET[bucket]), ctx, max_tokens=3000)
        for f in r.get("facts", []):
            src = f.get("source") or {}
            facts.append(Fact(
                section=f.get("section", ""), field_name=f.get("field_name", ""),
                value=str(f.get("value", "Not stated")),
                confidence=float(f.get("confidence", 0.0) or 0.0),
                source=Source(type=src.get("type", "email"), file=src.get("file"),
                              page=src.get("page"), quote=src.get("quote")),
            ))
    return facts


def extract_facts(req: ProcessRequest, pdfs: list[PdfResult],
                  verdicts: list[BucketVerdict]) -> list[Fact]:
    active = [v.bucket for v in verdicts if v.applies and v.bucket != "NOT_RELEVANT"]
    chunks = [f"[email]\n{req.email_body}"]
    for p in pdfs:
        chunks.append(f"[pdf {p.filename}]\n{p.full_text[:MAX_CTX_CHARS // max(len(pdfs), 1)]}")
    return extract_from_chunks(active, chunks)


def run(req: ProcessRequest) -> ProcessResponse:
    lat: dict = {}
    t0 = time.time()
    pdfs: list[PdfResult] = []
    for p in req.pdfs:
        ts = time.time()
        pdfs.append(process_pdf(p.filename, base64.b64decode(p.base64)))
        lat[f"pdf:{p.filename}"] = int((time.time() - ts) * 1000)

    ts = time.time()
    verdicts = classify(req, pdfs)
    lat["classify"] = int((time.time() - ts) * 1000)

    ts = time.time()
    facts = extract_facts(req, pdfs, verdicts)
    lat["extract"] = int((time.time() - ts) * 1000)

    lat["total"] = int((time.time() - t0) * 1000)
    log.info("Message %s processed in %dms (%d pdfs, %d facts)",
             req.message_id, lat["total"], len(pdfs), len(facts))
    return ProcessResponse(message_id=req.message_id, model=MODEL,
                           prompt_version=PROMPT_VERSION, latency_ms=lat,
                           pdfs=pdfs, classifications=verdicts, facts=facts)
