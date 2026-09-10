"""Non-PDF attachment support: turn images / Microsoft Office / text files into
plain text so the same classify + extract path can run on them."""
import base64
import csv
import io
import logging

from .constants import (FLAVOR_IMAGE, FLAVOR_OFFICE, FLAVOR_TEXT,
                        IMAGE_EXTS, OFFICE_EXTS, TEXT_EXTS)

log = logging.getLogger("ai-service.doc")


def kind_for(filename: str, mime: str = "") -> str | None:
    """Return the flavor for a non-PDF attachment we can handle, else None."""
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    m = (mime or "").lower()
    if ext in IMAGE_EXTS or m.startswith("image/"):
        return FLAVOR_IMAGE
    if ext in OFFICE_EXTS or "officedocument" in m or m in (
            "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint"):
        return FLAVOR_OFFICE
    if ext in TEXT_EXTS or m.startswith("text/") or m in ("message/rfc822", "application/json"):
        return FLAVOR_TEXT
    return None


def image_to_png_b64(data: bytes) -> str:
    """Normalise any raster image (jpg/png/webp/gif/tiff) to base64 PNG for the vision model."""
    from PIL import Image
    im = Image.open(io.BytesIO(data))
    if getattr(im, "is_animated", False):
        im.seek(0)
    im = im.convert("RGB")
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _docx_text(data: bytes) -> str:
    import docx
    d = docx.Document(io.BytesIO(data))
    parts = [p.text for p in d.paragraphs if p.text.strip()]
    for t in d.tables:
        for row in t.rows:
            cells = [c.text.strip() for c in row.cells]
            if any(cells):
                parts.append(" | ".join(cells))
    return "\n".join(parts)


def _xlsx_text(data: bytes) -> str:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    out = []
    for ws in wb.worksheets:
        out.append(f"[sheet {ws.title}]")
        for row in ws.iter_rows(values_only=True):
            cells = ["" if v is None else str(v) for v in row]
            if any(cells):
                out.append(" | ".join(cells))
    return "\n".join(out)


def _pptx_text(data: bytes) -> str:
    from pptx import Presentation
    prs = Presentation(io.BytesIO(data))
    out = []
    for i, slide in enumerate(prs.slides, 1):
        out.append(f"[slide {i}]")
        for shape in slide.shapes:
            if shape.has_text_frame and shape.text_frame.text.strip():
                out.append(shape.text_frame.text)
    return "\n".join(out)


def office_text(filename: str, data: bytes) -> str:
    """Best-effort text from docx / xlsx / pptx. Legacy .doc/.xls/.ppt are not supported."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "docx":
        return _docx_text(data)
    if ext == "xlsx":
        return _xlsx_text(data)
    if ext == "pptx":
        return _pptx_text(data)
    raise ValueError(f"unsupported office format: {filename}")


# raster image parts inside a docx/pptx/xlsx are just zip entries under word/media, ppt/media, xl/media
_MEDIA_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".webp", ".emf", ".wmf")


def office_images(filename: str, data: bytes, limit: int = 6) -> list[bytes]:
    """Return the embedded raster images from an office file, as raw bytes (largest first)."""
    import zipfile
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("docx", "xlsx", "pptx"):
        return []
    out = []
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = [n for n in z.namelist()
                     if "/media/" in n and n.lower().endswith(_MEDIA_EXTS)]
            for n in sorted(names, key=lambda n: z.getinfo(n).file_size, reverse=True)[:limit]:
                out.append(z.read(n))
    except Exception as e:  # noqa: BLE001
        log.warning("office_images failed for %s: %s", filename, e)
    return out


def text_content(filename: str, data: bytes) -> str:
    """Decode a text-family file; strip HTML, flatten CSV, keep .eml body-ish text."""
    raw = data.decode("utf-8", errors="replace")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in ("html", "htm"):
        import re
        raw = re.sub(r"(?is)<(script|style).*?</\1>", " ", raw)
        raw = re.sub(r"(?s)<[^>]+>", " ", raw)
        return re.sub(r"[ \t]*\n[ \t]*", "\n", raw).strip()
    if ext == "csv":
        rows = list(csv.reader(io.StringIO(raw)))
        return "\n".join(" | ".join(r) for r in rows if any(c.strip() for c in r))
    if ext == "eml":
        import email
        msg = email.message_from_string(raw)
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        return raw
    return raw
