"""Orchestrates: PDF understanding -> classification -> fact extraction."""
import base64
import logging
import time

from . import callrec
from . import pdf_utils as pu
from . import guardrails as gr
from .config import config
from .constants import MAX_CTX_CHARS
from .llm import ask_json, image_part, load_prompt, text_part, MODEL, PROMPT_VERSION
from .schemas import (AiCall, BucketVerdict, ClassifyResponse, ExtractResponse,
                      Fact, PdfResult, ProcessRequest, ProcessResponse, Source)
from .validators import clean_facts, clean_verdicts

log = logging.getLogger("ai-service.pipeline")

PROMPT_BY_BUCKET = {"ICSR": "extract_icsr", "PQC": "extract_pqc", "MI": "extract_mi"}


def _guarded(prompt_name: str, untrusted_text: str, **kw) -> dict:
    """ask_json with the injection guard + fenced untrusted content, recorded as `prompt_name`."""
    return ask_json(load_prompt(prompt_name), gr.wrap_untrusted(untrusted_text),
                    step=prompt_name, untrusted_guard=True, **kw)


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
                             [image_part(png), text_part("Transcribe this page.")], step="ocr")
                parts.append(f"[page {p['page']}]\n{r.get('text', '')}")
                confs.append(float(r.get("confidence", 0.0)))
            else:
                parts.append(f"[page {p['page']}]\n(digital page - see full_text)")
        text = "\n".join(parts) if flavor == pu.FLAVOR_SCANNED else text + "\n" + "\n".join(parts)
        ocr_conf = round(sum(confs) / len(confs), 2) if confs else None

    if flavor == pu.FLAVOR_NON_ENGLISH or (lang not in ("en", "unknown") and flavor != pu.FLAVOR_SCANNED):
        r = _guarded("translate", text[:MAX_CTX_CHARS], max_tokens=4000)
        original = text
        text = r.get("english_text", text)
        lang = r.get("language", lang)

    if flavor == pu.FLAVOR_ARTICLE:
        r = _guarded("article_case", text[:MAX_CTX_CHARS], max_tokens=3000)
        if r.get("has_patient_case"):
            text = "\n\n".join(c.get("text", "") for c in r.get("cases", []))

    tables = pu.extract_tables(pdf_bytes)
    form_fields = pu.extract_form_fields(pdf_bytes) if flavor == pu.FLAVOR_DIGITAL else []

    images = []
    for im in pu.list_images(pdf_bytes):
        png = pu.render_page_png(pdf_bytes, im["page"] - 1)
        cap = ask_json(load_prompt("image_caption"),
                       [image_part(png), text_part(f"Describe the notable image on page {im['page']}.")], step="image_caption")
        images.append({"page": im["page"], "needs_human_review": True, **cap})

    scan = gr.scan(info["full_text"] + "\n" + text)
    summ = _guarded("pdf_summary",
                    f"FILENAME: {name}\nFLAVOR: {flavor}\n\nTEXT:\n{text[:MAX_CTX_CHARS]}\n\n"
                    f"FORM_FIELDS: {form_fields[:30]}\nTABLES: {tables[:5]}\nIMAGES: {images}", max_tokens=1500)

    return PdfResult(
        filename=name, flavor=flavor, language=lang, page_count=n,
        full_text=text, original_text=original, ocr_confidence=ocr_conf,
        tables=tables, images=images, form_fields=form_fields,
        summary=summ.get("summary", ""), looks_relevant=summ.get("looks_relevant"),
        relevance_reason=summ.get("relevance_reason", ""),
        injection_flagged=scan["flagged"],
        injection_notes=", ".join(scan["tags"]),
    )


def classify_context(email_from: str, email_subject: str, email_body: str,
                     pdf_summaries: list[str]) -> ClassifyResponse:
    ctx = f"[email] from={email_from} subject={email_subject}\n{email_body}\n\n"
    for i, s in enumerate(pdf_summaries, 1):
        ctx += f"[pdf {i}] summary: {s}\n"
    scan = gr.scan(ctx)
    r = _guarded("classify", ctx[:MAX_CTX_CHARS])
    verdicts = [BucketVerdict(**v) for v in clean_verdicts(r.get("verdicts", []))]
    log.info("Classified: %s (injection_flagged=%s)",
             [f"{v.bucket}={v.applies}" for v in verdicts], scan["flagged"])
    return ClassifyResponse(model=MODEL, prompt_version=PROMPT_VERSION, classifications=verdicts,
                            injection_flagged=scan["flagged"], injection_notes=", ".join(scan["tags"]))


def extract_from_chunks(categories: list[str], context_chunks: list[str]) -> ExtractResponse:
    active = [c for c in categories if c in PROMPT_BY_BUCKET]
    ctx = "\n\n".join(context_chunks)
    scan = gr.scan(ctx)
    if not active:
        log.info("No extractable categories, skipping fact extraction")
        return ExtractResponse(model=MODEL, prompt_version=PROMPT_VERSION, facts=[],
                               injection_flagged=scan["flagged"], injection_notes=", ".join(scan["tags"]))
    facts: list[Fact] = []
    for bucket in active:
        r = _guarded(PROMPT_BY_BUCKET[bucket], ctx, max_tokens=3000)
        for f in clean_facts(r.get("facts", [])):
            value = str(f.get("value", "Not stated")).strip() or "Not stated"
            if value == "Not stated":                       # spec §8: absent -> null, null
                facts.append(Fact(section=f.get("section", ""), field_name=f.get("field_name", ""),
                                  value="Not stated", confidence=None, source=None))
                continue
            src = f.get("source") or {}
            src_type = src.get("type") if src.get("type") in ("email", "pdf") else None
            facts.append(Fact(
                section=f.get("section", ""), field_name=f.get("field_name", ""), value=value,
                confidence=f.get("confidence"),
                source=Source(type=src_type, file=src.get("file"), page=src.get("page"),
                              quote=src.get("quote")) if src_type else None,
            ))
    return ExtractResponse(model=MODEL, prompt_version=PROMPT_VERSION, facts=facts,
                           injection_flagged=scan["flagged"], injection_notes=", ".join(scan["tags"]))


def run(req: ProcessRequest) -> ProcessResponse:
    callrec.start()
    lat: dict = {}
    t0 = time.time()
    pdfs: list[PdfResult] = []
    for p in req.pdfs:
        ts = time.time()
        pdfs.append(process_pdf(p.filename, base64.b64decode(p.base64)))
        lat[f"pdf:{p.filename}"] = int((time.time() - ts) * 1000)

    ts = time.time()
    cls = classify_context(req.email_from, req.email_subject, req.email_body,
                           [p.summary for p in pdfs])
    lat["classify"] = int((time.time() - ts) * 1000)

    ts = time.time()
    active = [v.bucket for v in cls.classifications if v.applies and v.bucket != "NOT_RELEVANT"]
    chunks = [f"[email]\n{req.email_body}"]
    for p in pdfs:
        chunks.append(f"[pdf {p.filename}]\n{p.full_text[:MAX_CTX_CHARS // max(len(pdfs), 1)]}")
    ext = extract_from_chunks(active, chunks)
    lat["extract"] = int((time.time() - ts) * 1000)

    flagged = cls.injection_flagged or ext.injection_flagged or any(p.injection_flagged for p in pdfs)
    notes = sorted({n for n in (
        [cls.injection_notes, ext.injection_notes] + [p.injection_notes for p in pdfs]) if n})

    lat["total"] = int((time.time() - t0) * 1000)
    log.info("Message %s processed in %dms (%d pdfs, %d facts, injection_flagged=%s)",
             req.message_id, lat["total"], len(pdfs), len(ext.facts), flagged)
    return ProcessResponse(message_id=req.message_id, model=MODEL,
                           prompt_version=PROMPT_VERSION, latency_ms=lat,
                           pdfs=pdfs, classifications=cls.classifications, facts=ext.facts,
                           injection_flagged=flagged, injection_notes="; ".join(notes),
                           ai_calls=[AiCall(**c) for c in callrec.collect()])
