"""Fixed values that never change at runtime. Rotatable config lives in env (see config.py)."""

BUCKETS = ["ICSR", "PQC", "MI", "NOT_RELEVANT"]

FLAVOR_DIGITAL = "DIGITAL"
FLAVOR_SCANNED = "SCANNED"
FLAVOR_ARTICLE = "ARTICLE"
FLAVOR_NON_ENGLISH = "NON_ENGLISH"
FLAVOR_MIXED = "MIXED"
FLAVOR_IMAGE = "IMAGE"          # standalone image attachment (jpg/png/...)
FLAVOR_OFFICE = "OFFICE"        # Microsoft Office: docx / xlsx / pptx
FLAVOR_TEXT = "TEXT"            # txt / eml / html / csv / rtf / md

# non-PDF attachment types the AI service can turn into text
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".bmp"}
OFFICE_EXTS = {".docx", ".xlsx", ".pptx"}
TEXT_EXTS = {".txt", ".text", ".eml", ".html", ".htm", ".csv", ".rtf", ".md", ".log", ".json"}

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
