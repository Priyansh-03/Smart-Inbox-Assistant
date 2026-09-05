"""PDF flavor detection + per-flavor extraction primitives."""
import base64
import io
import logging
import re
from typing import List

import fitz  # PyMuPDF
import pdfplumber
from langdetect import detect, DetectorFactory

from .constants import (FLAVOR_ARTICLE, FLAVOR_DIGITAL, FLAVOR_MIXED,
                        FLAVOR_NON_ENGLISH, FLAVOR_SCANNED, IMAGE_MIN_AREA_FRAC,
                        OCR_RENDER_DPI, SCANNED_MAX_CHARS, SCANNED_MIN_IMG_COVER)

DetectorFactory.seed = 0
log = logging.getLogger("ai-service.pdf")

_LABEL_LINE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9 /_\-]{1,40}?)\s*:\s*(\S.*\S|\S)\s*$")


def _page_text(page) -> str:
    return page.get_text("text") or ""


def _linearize_page(page) -> str:
    """Reading-order text. Two-column pages: left column entirely before right column,
    so a multi-column article is not interleaved line-by-line."""
    blocks = [b for b in page.get_text("blocks") if b[6] == 0 and b[4].strip()]
    if not blocks:
        return _page_text(page)
    if _looks_multicolumn(page):
        mid = page.rect.width / 2
        left = sorted((b for b in blocks if (b[0] + b[2]) / 2 < mid), key=lambda b: (round(b[1]), b[0]))
        right = sorted((b for b in blocks if (b[0] + b[2]) / 2 >= mid), key=lambda b: (round(b[1]), b[0]))
        ordered = left + right
    else:
        ordered = sorted(blocks, key=lambda b: (round(b[1]), b[0]))
    return "\n".join(b[4].strip() for b in ordered)


def _image_coverage(page) -> float:
    """Fraction of the page area covered by raster images (rough)."""
    page_area = abs(page.rect.width * page.rect.height) or 1.0
    covered = 0.0
    for img in page.get_images(full=True):
        for r in page.get_image_rects(img[0]):
            covered += abs(r.width * r.height)
    return min(covered / page_area, 1.0)


def _looks_multicolumn(page) -> bool:
    blocks = [b for b in page.get_text("blocks") if b[6] == 0 and b[4].strip()]
    if len(blocks) < 2:
        return False
    mid = page.rect.width / 2
    left = [b for b in blocks if b[2] < mid]           # ends left of centre
    right = [b for b in blocks if b[0] > mid]          # starts right of centre
    if len(left) >= 3 and len(right) >= 3:
        return True
    # a real second column = at least two prose blocks on each side, both sides substantial
    l_chars = sum(len(b[4]) for b in left)
    r_chars = sum(len(b[4]) for b in right)
    return len(left) >= 2 and len(right) >= 2 and min(l_chars, r_chars) >= 200


def detect_language(text: str) -> str:
    sample = text.strip()[:2000]
    if len(sample) < 20:
        return "unknown"
    try:
        return detect(sample)
    except Exception:
        return "unknown"


def analyse(pdf_bytes: bytes, page_cap: int = 120) -> dict:
    """Return flavor, language, page_count, raw digital text, per-page notes."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    total_pages = len(doc)
    capped = total_pages > page_cap
    if capped:
        log.warning("PDF has %d pages, capping analysis at %d", total_pages, page_cap)
    pages = []
    full_text_parts = []
    scanned_pages = 0
    article_pages = 0
    for i, page in enumerate(doc):
        if i >= page_cap:
            break
        txt = _linearize_page(page)
        chars = len(txt.strip())
        img_cov = _image_coverage(page)
        is_scanned = chars < SCANNED_MAX_CHARS and img_cov > SCANNED_MIN_IMG_COVER
        is_article = chars > 400 and _looks_multicolumn(page)
        if is_scanned:
            scanned_pages += 1
        if is_article:
            article_pages += 1
        pages.append({"page": i + 1, "chars": chars, "img_cov": round(img_cov, 2),
                      "scanned": is_scanned, "article": is_article})
        full_text_parts.append(f"[page {i + 1}]\n{txt}")

    full_text = "\n".join(full_text_parts)
    lang = detect_language(full_text)
    n = total_pages

    if scanned_pages and scanned_pages < n:
        flavor = FLAVOR_MIXED
    elif scanned_pages == n and n > 0:
        flavor = FLAVOR_SCANNED
    elif article_pages >= max(1, n // 2):
        flavor = FLAVOR_ARTICLE
    elif lang not in ("en", "unknown"):
        flavor = FLAVOR_NON_ENGLISH
    else:
        flavor = FLAVOR_DIGITAL

    doc.close()
    return {"flavor": flavor, "language": lang, "page_count": n, "capped": capped,
            "full_text": full_text, "pages": pages}


def extract_form_fields(pdf_bytes: bytes) -> List[dict]:
    """Digital-PDF form fields as {page, label, value}. Real AcroForm widgets if the
    PDF has them; otherwise 'Label: value' lines, read in the same column-aware order
    as the rest of the text so labels stay paired with their values."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    fields: List[dict] = []
    for i, page in enumerate(doc):
        for w in (page.widgets() or []):
            if w.field_name:
                fields.append({"page": i + 1, "label": w.field_name,
                              "value": (w.field_value or "").strip(), "source": "acroform"})
    if not fields:
        for i, page in enumerate(doc):
            for line in _linearize_page(page).splitlines():
                m = _LABEL_LINE.match(line)
                if m:
                    fields.append({"page": i + 1, "label": m.group(1).strip(),
                                  "value": m.group(2).strip(), "source": "text"})
    doc.close()
    return fields


def render_page_png(pdf_bytes: bytes, page_index: int, dpi: int = OCR_RENDER_DPI) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[page_index]
    pix = page.get_pixmap(dpi=dpi)
    data = pix.tobytes("png")
    doc.close()
    return base64.b64encode(data).decode()


def extract_tables(pdf_bytes: bytes) -> List[dict]:
    out = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for i, page in enumerate(pdf.pages):
            for t in page.extract_tables() or []:
                if t:
                    out.append({"page": i + 1, "rows": t})
    return out


def list_images(pdf_bytes: bytes, min_area_frac: float = IMAGE_MIN_AREA_FRAC) -> List[dict]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    imgs = []
    for i, page in enumerate(doc):
        page_area = abs(page.rect.width * page.rect.height) or 1.0
        for img in page.get_images(full=True):
            for r in page.get_image_rects(img[0]):
                if abs(r.width * r.height) / page_area >= min_area_frac:
                    imgs.append({"page": i + 1, "xref": img[0]})
    doc.close()
    return imgs
