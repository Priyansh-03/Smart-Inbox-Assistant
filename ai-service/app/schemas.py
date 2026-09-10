from typing import List, Optional, Any
from pydantic import BaseModel, Field

BUCKETS = ["ICSR", "PQC", "MI", "NOT_RELEVANT"]


class PdfIn(BaseModel):
    filename: str
    base64: str
    mime: str = ""            # content-type hint; used to route non-PDF attachments


class ProcessRequest(BaseModel):
    message_id: str
    email_from: str = ""
    email_subject: str = ""
    email_body: str = ""
    email_date: Optional[str] = None      # ISO date the email was received; anchors relative dates
    pdfs: List[PdfIn] = []


class Source(BaseModel):
    type: Optional[str] = None    # "email" | "pdf"
    file: Optional[str] = None
    page: Optional[int] = None
    quote: Optional[str] = None


class Fact(BaseModel):
    section: str
    field_name: str
    value: str = "Not stated"
    confidence: Optional[float] = None      # null when the field is "Not stated" (spec §8)
    source: Optional[Source] = None         # null when the field is "Not stated"


class BucketVerdict(BaseModel):
    bucket: str
    applies: bool
    confidence: float = 0.0
    reason: str = ""


class PdfResult(BaseModel):
    filename: str
    flavor: str
    language: str = "en"
    page_count: int = 0
    full_text: str = ""
    original_text: Optional[str] = None
    ocr_confidence: Optional[float] = None
    tables: List[Any] = []
    images: List[dict] = []
    form_fields: List[dict] = []
    summary: str = ""
    looks_relevant: Optional[bool] = None
    relevance_reason: str = ""
    injection_flagged: bool = False
    injection_notes: str = ""


class AiCall(BaseModel):
    step: str
    model: str
    prompt_version: str
    input_hash: str
    output: Any = None
    usage: Optional[dict] = None
    duration_ms: int = 0
    error: Optional[str] = None
    ts: float = 0.0


class ProcessResponse(BaseModel):
    message_id: str
    model: str
    prompt_version: str
    latency_ms: dict
    pdfs: List[PdfResult] = []
    classifications: List[BucketVerdict] = []
    facts: List[Fact] = []
    ai_calls: List[AiCall] = []
    injection_flagged: bool = False
    injection_notes: str = ""


# ---- per-stage request/response models (each stage runnable on its own) ----

class PdfRequest(BaseModel):
    filename: str
    base64: str
    mime: str = ""


class ClassifyRequest(BaseModel):
    email_from: str = ""
    email_subject: str = ""
    email_body: str = ""
    pdf_summaries: List[str] = []


class ClassifyResponse(BaseModel):
    model: str
    prompt_version: str
    classifications: List[BucketVerdict] = []
    injection_flagged: bool = False
    injection_notes: str = ""


class ExtractRequest(BaseModel):
    categories: List[str]                 # any of ICSR / PQC / MI
    context_chunks: List[str]             # labelled "[email] ...", "[pdf FILE p3] ..."


class ExtractResponse(BaseModel):
    model: str
    prompt_version: str
    facts: List[Fact] = []
    injection_flagged: bool = False
    injection_notes: str = ""
