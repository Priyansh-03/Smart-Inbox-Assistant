"""Fixed values that never change at runtime. Rotatable config lives in env (see config.py)."""

BUCKETS = ["ICSR", "PQC", "MI", "NOT_RELEVANT"]

FLAVOR_DIGITAL = "DIGITAL"
FLAVOR_SCANNED = "SCANNED"
FLAVOR_ARTICLE = "ARTICLE"
FLAVOR_NON_ENGLISH = "NON_ENGLISH"
FLAVOR_MIXED = "MIXED"

NOT_STATED = "Not stated"

MAX_CTX_CHARS = 12000
OCR_RENDER_DPI = 200
IMAGE_MIN_AREA_FRAC = 0.03
SCANNED_MAX_CHARS = 40
SCANNED_MIN_IMG_COVER = 0.4

PROMPT_FILES = {
    "ocr", "image_caption", "translate", "article_case",
    "pdf_summary", "classify", "extract_icsr", "extract_pqc", "extract_mi",
}
