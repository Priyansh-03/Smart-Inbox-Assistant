#!/usr/bin/env python3
"""Build .eml files that carry a PDF attachment, so the mailbox path is exercised too.

Run after generate_pdfs.py.  Output: sample-data/emails/*_pdf_*.eml
"""
import pathlib
from email.message import EmailMessage

HERE = pathlib.Path(__file__).resolve().parent
PDFS = HERE / "pdfs"
EMAILS = HERE / "emails"

CASES = [
    ("email_pdf_report_digital.eml", "<pdf-report-digital-001@example.com>",
     "Dr. Raymond Bell <r.bell@example-hospital.test>", "safety@example-pharma.test",
     "AE report form attached - Hepavex hepatitis",
     "Please find the completed adverse event report form attached (synthetic data). "
     "Patient developed hepatitis on Hepavex; details are on the form.",
     "pdf_report_01.pdf"),
    ("email_pdf_scanned.eml", "<pdf-scanned-001@example.com>",
     "Nurse J. Adeyemi <j.adeyemi@example-clinic.test>", "safety@example-pharma.test",
     "Scanned handwritten AE form - Uratrol reaction",
     "Attaching a scan of the hand-completed form for a patient with a severe skin "
     "reaction on Uratrol. Handwriting is a bit rough, sorry.",
     "pdf_scanned_01.pdf"),
    ("email_pdf_non_english.eml", "<pdf-de-001@example.com>",
     "Dr. Petra Vogel <p.vogel@example-klinik.test>", "safety@example-pharma.test",
     "Nebenwirkungsmeldung - Kardiodol (Formular anbei)",
     "Anbei die ausgefuellte Nebenwirkungsmeldung zu Kardiodol. Synthetische Daten.",
     "pdf_case_de.pdf"),
    ("email_pdf_article_twocases.eml", "<pdf-article-001@example.com>",
     "Medical Librarian <library@example-pharma.test>", "safety@example-pharma.test",
     "FW: published case series - Broncholyt anaphylaxis (2 cases)",
     "Forwarding a journal case report describing two paediatric anaphylaxis cases "
     "temporally associated with Broncholyt. Flagging for PV assessment.",
     "pdf_article_02.pdf"),
    ("email_pdf_pqc_photo_real.eml", "<pdf-pqc-photo-001@example.com>",
     "Pharmacist K. Owens <k.owens@example-pharmacy.test>", "quality@example-pharma.test",
     "Damaged Carditol blister - photo attached",
     "The attached quality complaint form has a photo of the damaged blister we "
     "received (synthetic data). Two tablets were crumbled and discoloured.",
     "pdf_pqc_photo_real.pdf"),
    ("email_pdf_icsr_rash.eml", "<pdf-icsr-rash-001@example.com>",
     "Dr M. Silva <m.silva@example-derm.test>", "safety@example-pharma.test",
     "Skin reaction on Uratrol - photo attached",
     "Reporting a widespread skin rash in a patient on Uratrol; the completed form "
     "with a photograph of the rash is attached (synthetic data).",
     "pdf_icsr_rash.pdf"),
]

for fname, msgid, frm, to, subj, body, pdf in CASES:
    m = EmailMessage()
    m["Message-ID"] = msgid
    m["From"] = frm
    m["To"] = to
    m["Subject"] = subj
    m["Date"] = "Fri, 05 Sep 2025 10:00:00 +0000"
    m.set_content(body)
    data = (PDFS / pdf).read_bytes()
    m.add_attachment(data, maintype="application", subtype="pdf", filename=pdf)
    (EMAILS / fname).write_bytes(m.as_bytes())
    print("wrote", fname, f"({len(data)} B pdf: {pdf})")
