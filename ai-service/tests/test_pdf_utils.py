"""Flavor detection unit tests - no LLM calls. Backs TODO.md TC2/TC4 and EC4/EC14."""
import fitz
import pytest

from app import pdf_utils as pu


def _digital_pdf(text: str, pages: int = 1) -> bytes:
    doc = fitz.open()
    for _ in range(pages):
        page = doc.new_page()
        page.insert_text((72, 72), text, fontsize=11)
    data = doc.tobytes()
    doc.close()
    return data


def _blank_image_pdf(pages: int = 1) -> bytes:
    doc = fitz.open()
    for _ in range(pages):
        page = doc.new_page()
        rect = fitz.Rect(0, 0, page.rect.width, page.rect.height)
        pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 200, 280))
        pix.clear_with(220)
        page.insert_image(rect, pixmap=pix)
    data = doc.tobytes()
    doc.close()
    return data


def test_digital_pdf_detected_as_digital():
    info = pu.analyse(_digital_pdf("Patient took DrugX and developed a rash. " * 20))
    assert info["flavor"] == pu.FLAVOR_DIGITAL
    assert info["page_count"] == 1
    assert "DrugX" in info["full_text"]


def test_image_only_pdf_detected_as_scanned():
    info = pu.analyse(_blank_image_pdf())
    assert info["flavor"] == pu.FLAVOR_SCANNED
    assert info["pages"][0]["scanned"] is True


def test_mixed_pdf_when_one_page_digital_one_scanned():
    doc = fitz.open()
    doc.new_page().insert_text((72, 72), "Digital case narrative text. " * 30, fontsize=11)
    page = doc.new_page()
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 200, 280))
    pix.clear_with(210)
    page.insert_image(page.rect, pixmap=pix)
    data = doc.tobytes()
    doc.close()
    info = pu.analyse(data)
    assert info["flavor"] == pu.FLAVOR_MIXED


def test_page_cap_enforced():
    info = pu.analyse(_digital_pdf("x " * 5, pages=8), page_cap=3)
    assert info["capped"] is True
    assert info["page_count"] == 8
    assert len(info["pages"]) == 3


def test_language_detection_german():
    info = pu.analyse(_digital_pdf("Der Patient nahm das Medikament und bekam Hautausschlag. " * 15))
    assert info["language"] == "de"
    assert info["flavor"] == pu.FLAVOR_NON_ENGLISH


def test_language_detection_spanish():
    info = pu.analyse(_digital_pdf("El paciente tomo el medicamento y presento una erupcion cutanea grave. " * 15))
    assert info["language"] == "es"
    assert info["flavor"] == pu.FLAVOR_NON_ENGLISH


def test_form_fields_extracted_from_label_lines():
    text = "Patient age: 54\nPatient sex: Male\nReporter: Dr Alice Smith\nProduct name: Carditol 40 mg"
    fields = pu.extract_form_fields(_digital_pdf(text))
    labels = [f["label"] for f in fields]
    values = {f["label"]: f["value"] for f in fields}
    assert labels == ["Patient age", "Patient sex", "Reporter", "Product name"]
    assert values["Patient age"] == "54"
    assert values["Reporter"] == "Dr Alice Smith"
    assert all(f["source"] == "text" for f in fields)


def test_form_fields_empty_when_no_label_lines():
    fields = pu.extract_form_fields(_digital_pdf("Just a plain narrative sentence with no colons at all. " * 5))
    assert fields == []


def _two_column_pdf() -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    left_x, right_x = 40, 320
    for i, word in enumerate(["LEFTONE", "LEFTTWO", "LEFTTHREE", "LEFTFOUR"]):
        page.insert_text((left_x, 80 + i * 60), word + " " * 40, fontsize=11)
    for i, word in enumerate(["RIGHTONE", "RIGHTTWO", "RIGHTTHREE", "RIGHTFOUR"]):
        page.insert_text((right_x, 80 + i * 60), word + " " * 40, fontsize=11)
    data = doc.tobytes()
    doc.close()
    return data


def test_multicolumn_article_keeps_columns_together_not_interleaved():
    info = pu.analyse(_two_column_pdf())
    text = info["full_text"]
    last_left = max(text.index(w) for w in ["LEFTONE", "LEFTTWO", "LEFTTHREE", "LEFTFOUR"])
    first_right = min(text.index(w) for w in ["RIGHTONE", "RIGHTTWO", "RIGHTTHREE", "RIGHTFOUR"])
    assert last_left < first_right, "left column should be fully read before the right column starts"


def test_corrupt_pdf_raises():
    with pytest.raises(Exception):
        pu.analyse(b"%PDF-1.4 not really a pdf")
