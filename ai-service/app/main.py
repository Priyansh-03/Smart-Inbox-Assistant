import base64
import logging

from fastapi import FastAPI, HTTPException

from .llm import cache_stats, MODEL, PROMPT_VERSION
from .pipeline import classify_context, extract_from_chunks, process_pdf, run, screen_article
from .schemas import (ClassifyRequest, ClassifyResponse, ExtractRequest,
                      ExtractResponse, PdfRequest, PdfResult, ProcessRequest,
                      ProcessResponse)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("ai-service")

app = FastAPI(title="Smart Inbox AI Service", version="1.0")


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL, "prompt_version": PROMPT_VERSION, "cache": cache_stats()}


@app.post("/ai/v1/pdf", response_model=PdfResult)
def pdf_stage(req: PdfRequest):
    try:
        return process_pdf(req.filename, base64.b64decode(req.base64))
    except Exception as e:  # noqa: BLE001
        log.exception("pdf stage failed for %s", req.filename)
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/ai/v1/classify", response_model=ClassifyResponse)
def classify_stage(req: ClassifyRequest):
    try:
        return classify_context(req.email_from, req.email_subject, req.email_body, req.pdf_summaries)
    except Exception as e:  # noqa: BLE001
        log.exception("classify stage failed")
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/ai/v1/extract", response_model=ExtractResponse)
def extract_stage(req: ExtractRequest):
    try:
        return extract_from_chunks(req.categories, req.context_chunks)
    except Exception as e:  # noqa: BLE001
        log.exception("extract stage failed")
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/ai/v1/literature")
def literature_stage(req: PdfRequest):
    """Literature screening: split an article into identifiable cases + ICSR facts each."""
    try:
        return screen_article(req.filename, base64.b64decode(req.base64))
    except Exception as e:  # noqa: BLE001
        log.exception("literature screening failed for %s", req.filename)
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/ai/v1/process", response_model=ProcessResponse)
def process(req: ProcessRequest):
    try:
        resp = run(req)
        log.info("processed message %s in %sms", req.message_id, resp.latency_ms.get("total"))
        return resp
    except Exception as e:  # noqa: BLE001 - surface as 502 so the worker can retry/fail
        log.exception("processing failed for message %s", req.message_id)
        raise HTTPException(status_code=502, detail=str(e))
