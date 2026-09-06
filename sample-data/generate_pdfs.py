#!/usr/bin/env python3
"""Generate the synthetic PDF corpus (spec section 12). All data is fictional.

Run:  python sample-data/generate_pdfs.py
Output: sample-data/pdfs/*.pdf  (5 digital forms, 2 scanned, 5 articles, 2 non-English)
"""
import io
import pathlib

import fitz  # PyMuPDF

OUT = pathlib.Path(__file__).resolve().parent / "pdfs"
OUT.mkdir(exist_ok=True)


def _form_pdf(path: str, lines: list[str]):
    doc = fitz.open()
    page = doc.new_page()
    y = 60
    page.insert_text((60, y), "ADVERSE EVENT REPORT FORM  (synthetic - not a real case)", fontsize=13)
    y += 30
    for label in lines:
        page.insert_text((60, y), label, fontsize=11)
        y += 22
    doc.save(str(OUT / path))
    doc.close()


def _scanned_pdf(path: str, lines: list[str]):
    """A digital form rasterised to an image-only page, lightly degraded - looks scanned."""
    tmp = fitz.open()
    p = tmp.new_page()
    y = 60
    p.insert_text((60, y), "ADVERSE EVENT REPORT (hand-completed)", fontsize=13)
    y += 30
    for label in lines:
        p.insert_text((60, y), label, fontsize=12)
        y += 26
    pix = p.get_pixmap(dpi=110)                    # low dpi = grainy
    tmp.close()
    doc = fitz.open()
    page = doc.new_page(width=pix.width, height=pix.height)
    page.insert_image(page.rect, pixmap=pix)
    doc.save(str(OUT / path))
    doc.close()


def _article_pdf(path: str, title: str, columns: list[str]):
    """Two-column journal-style layout."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_textbox(fitz.Rect(50, 40, 550, 90), title, fontsize=14, align=1)
    left = fitz.Rect(50, 100, 290, 780)
    right = fitz.Rect(310, 100, 550, 780)
    page.insert_textbox(left, columns[0], fontsize=9)
    page.insert_textbox(right, columns[1], fontsize=9)
    doc.save(str(OUT / path))
    doc.close()


# ---- 5 digital report forms ----
FORMS = [
    ("pdf_report_01.pdf", [
        "Patient age: 61", "Patient sex: Female", "Patient weight: 70 kg",
        "Medical history: type 2 diabetes",
        "Product name: Hepavex 500 mg capsules", "Dose: 500 mg twice daily", "Route: oral",
        "Start date: 03 Jul 2025", "Stop date: 18 Jul 2025",
        "Reaction: nausea, vomiting and jaundice", "Onset date: 15 Jul 2025",
        "Outcome: recovering", "Serious - hospitalisation: Yes",
        "Reporter: Dr. Raymond Bell, hepatologist", "Reporter country: Canada",
    ]),
    ("pdf_report_02.pdf", [
        "Patient age: 8", "Patient sex: Male", "Patient weight: 26 kg",
        "Medical history: none",
        "Product name: Broncholyt syrup", "Dose: 5 mL three times daily", "Route: oral",
        "Start date: 20 Aug 2025", "Stop date: 22 Aug 2025",
        "Reaction: urticarial rash and wheezing", "Onset date: 21 Aug 2025",
        "Outcome: resolved after antihistamine", "Serious - life-threatening: No",
        "Reporter: parent", "Reporter country: United Kingdom",
    ]),
    ("pdf_report_03.pdf", [
        "Patient age: 45", "Patient sex: Female", "Patient weight: not stated",
        "Medical history: hypothyroidism",
        "Product name: Nervasol 75 mg tablets", "Dose: 75 mg at night", "Route: oral",
        "Start date: 01 Jun 2025", "Stop date: not stated",
        "Reaction: dizziness and a single fall", "Onset date: 10 Jun 2025",
        "Outcome: unknown", "Serious: No",
        "Reporter: community pharmacist", "Reporter country: Australia",
    ]),
    ("pdf_report_04.pdf", [
        "Patient age: 73", "Patient sex: Male", "Patient weight: 81 kg",
        "Medical history: atrial fibrillation, CKD stage 3",
        "Product name: Coagustat 5 mg tablets", "Dose: 5 mg once daily", "Route: oral",
        "Start date: 12 May 2025", "Stop date: 30 May 2025",
        "Reaction: gastrointestinal bleeding", "Onset date: 28 May 2025",
        "Outcome: recovered after transfusion", "Serious - hospitalisation: Yes",
        "Reporter: Dr. Lena Ford, cardiologist", "Reporter country: Germany",
    ]),
    ("pdf_report_05.pdf", [
        "Patient age: 34", "Patient sex: Female", "Patient weight: 62 kg",
        "Medical history: migraine",
        "Product name: Sumaquel 50 mg tablets", "Dose: 50 mg as needed", "Route: oral",
        "Start date: 05 Sep 2025", "Stop date: 05 Sep 2025",
        "Reaction: chest tightness and palpitations", "Onset date: 05 Sep 2025",
        "Outcome: resolved same day", "Serious: No",
        "Reporter: Dr. Iris Kwon, neurologist", "Reporter country: South Korea",
    ]),
]
for name, lines in FORMS:
    _form_pdf(name, lines)

# ---- 2 scanned / handwritten-style ----
_scanned_pdf("pdf_scanned_01.pdf", [
    "Patient: 57 yo male   Wt: 90 kg", "Hx: hypertension, gout",
    "Drug: Uratrol 300 mg  - 1 tab daily", "Started ~2 weeks ago",
    "Problem: swollen painful joints got worse, then bad skin peeling",
    "Sent to hospital 02 Sep", "Reporter: nurse J. Adeyemi (Nigeria)",
])
_scanned_pdf("pdf_scanned_02.pdf", [
    "AE form (handwritten)", "Pt 29 F, 55kg, no PMH",
    "Product: Dermaclear cream, applied twice daily x5 days",
    "Reaction: severe contact dermatitis, face swelling",
    "Outcome: improving on steroids", "Not hospitalised",
    "Reporter: Dr M. Silva, dermatologist, Portugal",
])

# ---- 5 articles (one with two cases) ----
_article_pdf(
    "pdf_article_01.pdf", "Acute hepatitis associated with Hepavex: a case report",
    [
        "Abstract. Drug-induced liver injury is an important cause of acute hepatitis. "
        "We describe a patient who developed hepatitis during Hepavex therapy.\n\n"
        "Introduction. Hepavex is widely prescribed. Rare hepatic adverse effects have "
        "been noted in post-marketing surveillance.\n\n"
        "Case. A 58-year-old woman with no significant history was started on Hepavex "
        "500 mg twice daily for a chest infection. ",
        "On day 12 she developed nausea, dark urine and scleral icterus. ALT was "
        "1240 U/L and bilirubin 96 umol/L. Hepavex was stopped. She was admitted for "
        "five days and recovered over three weeks. Causality was assessed as probable.\n\n"
        "Discussion. Clinicians should consider Hepavex in unexplained hepatitis. "
        "References. 1. Smith J. Hepatology. 2019. 2. Doe A. J Hepatol. 2021.",
    ],
)
_article_pdf(
    "pdf_article_02.pdf", "Two cases of anaphylaxis following Broncholyt in children",
    [
        "Abstract. We report two paediatric cases of anaphylaxis temporally associated "
        "with Broncholyt syrup.\n\n"
        "Case 1. A 6-year-old boy received Broncholyt 5 mL for cough. Within 30 minutes "
        "he developed generalised urticaria, facial swelling and stridor. He was treated "
        "with intramuscular adrenaline and recovered. ",
        "Case 2. A 9-year-old girl was given Broncholyt for bronchitis. Two hours later "
        "she had vomiting, wheeze and hypotension, requiring adrenaline and overnight "
        "observation. Both children recovered fully.\n\n"
        "Discussion. Excipient hypersensitivity is the suspected mechanism. "
        "References. 1. Lee K. Pediatr Allergy. 2020.",
    ],
)
_article_pdf(
    "pdf_article_03.pdf", "Serotonin syndrome and Nervasol: a report",
    [
        "Abstract. Serotonin syndrome is a potentially serious drug reaction.\n\n"
        "Case. A 45-year-old woman on Nervasol 75 mg nightly for neuropathic pain "
        "presented with agitation, tremor, hyperreflexia and a temperature of 38.9 C "
        "after a dose increase. ",
        "Nervasol was withheld and she was managed with supportive care and "
        "benzodiazepines, recovering within 48 hours.\n\n"
        "Discussion. Prescribers should be alert to serotonergic interactions. "
        "References. 1. Boyer EW. N Engl J Med. 2005.",
    ],
)
_article_pdf(
    "pdf_article_04.pdf", "Population-level analysis of Coagustat bleeding risk (no individual case)",
    [
        "Abstract. We analysed a registry of 40,000 patients receiving Coagustat to "
        "estimate major bleeding rates. This is a cohort analysis and does not describe "
        "any identifiable individual patient.\n\n"
        "Methods. Retrospective cohort. Major bleeding defined per ISTH criteria. ",
        "Results. The annualised major bleeding rate was 3.1 per 100 patient-years, "
        "higher in patients over 75 and with renal impairment.\n\n"
        "Conclusion. Bleeding risk should be weighed against thrombotic benefit. "
        "No case narratives are included. References. 1. Trial group. Lancet. 2022.",
    ],
)
_article_pdf(
    "pdf_article_05.pdf", "Coronary vasospasm after Sumaquel: a case report",
    [
        "Abstract. Triptans can rarely cause coronary vasospasm.\n\n"
        "Case. A 34-year-old woman with migraine took Sumaquel 50 mg for an acute "
        "attack. Twenty minutes later she developed central chest tightness and "
        "palpitations. ECG showed transient ST changes. ",
        "Symptoms resolved within an hour without infarction. Troponin was negative. "
        "She was advised to avoid triptans.\n\n"
        "Discussion. A cardiovascular history should be sought before triptan use. "
        "References. 1. Dodick DW. Headache. 2004.",
    ],
)

# ---- 2 non-English ----
_form_pdf("pdf_case_de.pdf", [
    "Nebenwirkungsmeldung (synthetischer Fall)",
    "Patient: 66 Jahre, maennlich, 88 kg",
    "Vorgeschichte: Bluthochdruck",
    "Arzneimittel: Kardiodol 40 mg Tabletten", "Dosis: 40 mg einmal taeglich", "Art: oral",
    "Beginn: 01.08.2025", "Ende: 20.08.2025",
    "Reaktion: schwerer Hautausschlag und Gesichtsschwellung",
    "Beginn der Reaktion: 18.08.2025",
    "Verlauf: Besserung nach Absetzen, stationaere Aufnahme fuer eine Nacht",
    "Melder: Dr. Petra Vogel, Kardiologin, Deutschland",
])
_form_pdf("pdf_case_es.pdf", [
    "Notificacion de reaccion adversa (caso sintetico)",
    "Paciente: 52 anos, mujer, 68 kg",
    "Antecedentes: hipotiroidismo",
    "Medicamento: Nervasol 75 mg comprimidos", "Dosis: 75 mg por la noche", "Via: oral",
    "Inicio: 10.06.2025", "Fin: no indicado",
    "Reaccion: mareo intenso y una caida",
    "Fecha de inicio: 12.06.2025",
    "Evolucion: desconocida", "Grave: No",
    "Notificador: farmaceutico comunitario, Espana",
])

print(f"wrote {len(list(OUT.glob('*.pdf')))} PDFs to {OUT}")

# ---- 1 digital PQC form with an embedded 'damaged product' photo ----
_doc = fitz.open()
_p = _doc.new_page()
_y = 60
_p.insert_text((60, _y), "PRODUCT QUALITY COMPLAINT FORM  (synthetic - not real)", fontsize=13)
_y += 30
for _line in [
    "Product name: Carditol 40 mg tablets", "Batch / lot number: CT-4471", "Expiry: 03/2027",
    "Complaint: blister foil punctured on arrival; two tablets crumbled and discoloured brown.",
    "Suspected counterfeit: No", "Contamination: not observed", "Photograph attached: Yes (see below)",
    "Reporter: pharmacist K. Owens, United States", "Patient harm: none reported",
]:
    _p.insert_text((60, _y), _line, fontsize=11); _y += 22
_img = fitz.open(); _ip = _img.new_page(width=320, height=220)
_ip.draw_rect(fitz.Rect(20, 20, 300, 200), color=(0.6, 0.6, 0.6), fill=(0.85, 0.85, 0.85), width=2)
for _cx in (70, 130, 190, 250):
    _ip.draw_circle(fitz.Point(_cx, 90), 22, color=(0.4, 0.25, 0.1), fill=(0.55, 0.35, 0.15))
    _ip.draw_circle(fitz.Point(_cx, 150), 22, color=(0.4, 0.25, 0.1), fill=(0.55, 0.35, 0.15))
_ip.draw_line(fitz.Point(40, 30), fitz.Point(150, 190), color=(0.1, 0.1, 0.1), width=3)
_pix = _ip.get_pixmap(dpi=120); _img.close()
_p.insert_image(fitz.Rect(60, _y + 10, 360, _y + 200), pixmap=_pix)
_doc.save(str(OUT / "pdf_pqc_photo.pdf")); _doc.close()
print("wrote pdf_pqc_photo.pdf")
