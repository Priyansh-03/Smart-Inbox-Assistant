import logging

from fastapi import FastAPI, HTTPException

from .pipeline import run
from .schemas import ProcessRequest, ProcessResponse

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ai-service")

app = FastAPI(title="Smart Inbox AI Service", version="1.0")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/process", response_model=ProcessResponse)
def process(req: ProcessRequest):
    try:
        resp = run(req)
        log.info("processed message %s in %sms", req.message_id, resp.latency_ms.get("total"))
        return resp
    except Exception as e:  # noqa: BLE001 - surface as 502 so the worker can retry/fail
        log.exception("processing failed for message %s", req.message_id)
        raise HTTPException(status_code=502, detail=str(e))
