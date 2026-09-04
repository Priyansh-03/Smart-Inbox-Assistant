from typing import List, Optional, Any
from pydantic import BaseModel, Field

BUCKETS = ["ICSR", "PQC", "MI", "NOT_RELEVANT"]


class PdfIn(BaseModel):
    filename: str
    base64: str


class ProcessRequest(BaseModel):
    message_id: str
    email_from: str = ""
    email_subject: str = ""
    email_body: str = ""
    pdfs: List[PdfIn] = []


class Source(BaseModel):
    type: str = "email"          # "email" | "pdf"
    file: Optional[str] = None
    page: Optional[int] = None
    quote: Optional[str] = None


class Fact(BaseModel):
    section: str
    field_name: str
    value: str = "Not stated"
    confidence: float = 0.0
    source: Source = Field(default_factory=Source)


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
    summary: str = ""
    looks_relevant: Optional[bool] = None
    relevance_reason: str = ""
    injection_flagged: bool = False
    injection_notes: str = ""


class ProcessResponse(BaseModel):
    message_id: str
    model: str
    prompt_version: str
    latency_ms: dict
    pdfs: List[PdfResult] = []
    classifications: List[BucketVerdict] = []
    facts: List[Fact] = []
    injection_flagged: bool = False
    injection_notes: str = ""


# ---- per-stage request/response models (each stage runnable on its own) ----

class PdfRequest(BaseModel):
    filename: str
    base64: str


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
