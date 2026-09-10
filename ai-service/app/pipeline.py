"""Orchestrates: PDF understanding -> classification -> fact extraction."""
import base64
import logging
import time

from . import callrec
from . import pdf_utils as pu
from . import doc_utils as du
from . import guardrails as gr
from .config import config
from .constants import MAX_CTX_CHARS, FLAVOR_IMAGE, FLAVOR_OFFICE
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


def process_document(name: str, data: bytes, mime: str = "") -> PdfResult:
    """Route an attachment to the right understanding path. PDFs go through process_pdf;
    images / office / text files are turned into text and summarised the same way."""
    is_pdf = name.lower().endswith(".pdf") or mime.lower() == "application/pdf" or data[:5] == b"%PDF-"
    if is_pdf:
        return process_pdf(name, data)
    kind = du.kind_for(name, mime)
    if kind is None:
        raise ValueError(f"unsupported document type: {name} ({mime})")
    return process_nonpdf(name, data, kind)


def process_nonpdf(name: str, data: bytes, flavor: str) -> PdfResult:
    """Image / office / text attachment -> plain text -> translate if needed -> summary."""
    log.info("DOC %s: flavor=%s (%d bytes)", name, flavor, len(data))
    lang, original, ocr_conf, images = "en", None, None, []

    if flavor == FLAVOR_IMAGE:
        png = du.image_to_png_b64(data)
        # 1) pull any legible text off the image
        r = ask_json(load_prompt("ocr"),
                     [image_part(png), text_part("Transcribe every word visible in this image.")],
                     step="ocr")
        ocr_text = (r.get("text") or "").strip()
        ocr_conf = float(r.get("confidence", 0.0)) or None
        # 2) describe what the image shows (works even when there is no text)
        cap = ask_json(load_prompt("image_caption"),
                       [image_part(png), text_part("Describe this image attachment.")],
                       step="image_caption")
        desc = (cap.get("description") or "").strip()
        images = [{"page": 1, "needs_human_review": True,
                   "kind": cap.get("kind") or "attachment_image",
                   "description": desc,
                   "reviewer_note": cap.get("reviewer_note")
                       or "standalone image attachment - reviewer should confirm"}]
        # the classify/extract context gets the description plus any transcribed text
        text = "\n".join(x for x in (f"[image description] {desc}" if desc else "",
                                     f"[text in image]\n{ocr_text}" if ocr_text else "") if x)
    elif flavor == FLAVOR_OFFICE:
        text = du.office_text(name, data)
        # caption any images embedded in the doc, so a photo pasted into a Word/PPT file is not lost
        for i, raw in enumerate(du.office_images(name, data), 1):
            try:
                png = du.image_to_png_b64(raw)
            except Exception:  # noqa: BLE001
                continue
            cap = ask_json(load_prompt("image_caption"),
                           [image_part(png), text_part(f"Describe embedded image {i} from this document.")],
                           step="image_caption")
            desc = (cap.get("description") or "").strip()
            images.append({"page": 1, "needs_human_review": True,
                           "kind": cap.get("kind") or "embedded_image",
                           "description": desc,
                           "reviewer_note": cap.get("reviewer_note") or "image embedded in the document"})
            if desc:
                text = f"{text}\n[embedded image {i}] {desc}"
    else:  # FLAVOR_TEXT
        text = du.text_content(name, data)

    text = (text or "").strip()

    lang_guess = pu.detect_language(text) if text else "unknown"
    if lang_guess not in ("en", "unknown"):
        r = _guarded("translate", text[:MAX_CTX_CHARS], max_tokens=4000)
        original = text
        text = r.get("english_text", text)
        lang = r.get("language", lang_guess)

    scan = gr.scan(text)
    summ = _guarded("pdf_summary",
                    f"FILENAME: {name}\nFLAVOR: {flavor}\n\nTEXT:\n{text[:MAX_CTX_CHARS]}\n\n"
                    f"FORM_FIELDS: []\nTABLES: []\nIMAGES: {images}", max_tokens=300)

    return PdfResult(
        filename=name, flavor=flavor, language=lang, page_count=1,
        full_text=text, original_text=original, ocr_confidence=ocr_conf,
        tables=[], images=images, form_fields=[],
        summary=summ.get("summary", ""), looks_relevant=summ.get("looks_relevant"),
        relevance_reason=summ.get("relevance_reason", ""),
        injection_flagged=scan["flagged"], injection_notes=", ".join(scan["tags"]),
    )


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
                    f"FORM_FIELDS: {form_fields[:30]}\nTABLES: {tables[:5]}\nIMAGES: {images}", max_tokens=300)

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


def screen_article(name: str, pdf_bytes: bytes) -> dict:
    """Literature screening (spec §14): split an article into identifiable individual
    patient cases and extract ICSR facts per case. Reuses process_pdf + extract."""
    callrec.start()
    pdf = process_pdf(name, pdf_bytes)          # gives flavor/language/summary + runs article_case
    r = _guarded("article_case", pdf.full_text[:MAX_CTX_CHARS], max_tokens=3000)
    raw_cases = r.get("cases", []) if r.get("has_patient_case") else []
    cases = []
    for i, c in enumerate(raw_cases, 1):
        label = c.get("case_label") or f"Case {i}"
        text = c.get("text", "")
        facts = extract_from_chunks(["ICSR"], [f"[pdf {name}]\n{text}"]).facts
        cases.append({"case_label": label, "text": text,
                      "reportable": bool(text.strip()),
                      "facts": [f.model_dump() for f in facts]})
    log.info("Literature: %s -> %d identifiable case(s)", name, len(cases))
    return {
        "filename": name, "flavor": pdf.flavor, "language": pdf.language,
        "summary": pdf.summary, "looks_relevant": pdf.looks_relevant,
        "relevance_reason": r.get("reason", pdf.relevance_reason),
        "has_patient_case": bool(cases), "cases": cases,
        "ai_calls": [AiCall(**x).model_dump() for x in callrec.collect()],
    }


def run(req: ProcessRequest) -> ProcessResponse:
    callrec.start()
    lat: dict = {}
    t0 = time.time()
    pdfs: list[PdfResult] = []
    for p in req.pdfs:
        ts = time.time()
        pdfs.append(process_document(p.filename, base64.b64decode(p.base64), getattr(p, "mime", "")))
        lat[f"doc:{p.filename}"] = int((time.time() - ts) * 1000)

    ts = time.time()
    cls = classify_context(req.email_from, req.email_subject, req.email_body,
                           [p.summary for p in pdfs])
    lat["classify"] = int((time.time() - ts) * 1000)

    ts = time.time()
    active = [v.bucket for v in cls.classifications if v.applies and v.bucket != "NOT_RELEVANT"]
    chunks = []
    if req.email_date:
        chunks.append(f"[email metadata]\nEmail received: {req.email_date}\n"
                      f"Resolve any relative date in the content against this date.")
    chunks.append(f"[email]\n{req.email_body}")
    # every attachment is labelled "[pdf FILE]" in the extract context so the model keeps
    # emitting source.type = "pdf" (the schema's document source); flavor still tells the UI apart
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
