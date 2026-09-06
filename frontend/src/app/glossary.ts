/** Plain-language tooltips for jargon, medical terms, and pipeline buckets. */
export const GLOSSARY: Record<string, string> = {
  // pipeline / triage buckets — the 4 assignment slugs
  icsr:
    'Safety Report ("ICSR"): a patient had a bad reaction to a drug — a specific patient, a specific drug, and a bad outcome.',
  pqc:
    'Quality Complaint ("PQC"): something is physically wrong with the product itself — broken seal, wrong colour, contamination, damaged packaging, counterfeit.',
  mi:
    'Info Request ("MI"): someone just has a question about a product — dosing, how to take it, interactions — with no bad reaction and no defect.',
  not_relevant:
    'Not Relevant: anything else — marketing, spam, internal admin chatter.',

  adverse_event:
    'Adverse event (AE): an unwanted medical occurrence in a patient given a medicine — it does not have to be caused by the drug.',
  product_complaint:
    'Product quality complaint (PQC): a problem with the product itself — defect, contamination, packaging, labelling, or it did not work as expected.',
  medical_information:
    'Medical information request: someone is asking a question about the product (dosing, interactions, storage) rather than reporting a problem.',
  medical_inquiry:
    'Medical information request: a question about the product rather than a problem report.',
  pregnancy:
    'Pregnancy / lactation exposure: the medicine was taken during pregnancy or breastfeeding — reportable even with no adverse event.',
  off_label:
    'Off-label use: the medicine was used for a condition, dose, or population not covered by the approved label.',
  safety_signal:
    'Safety signal: information suggesting a new or changed risk that may need investigation.',
  suspected_counterfeit:
    'Suspected counterfeit / falsified medicine: the product may be fake, tampered with, or from an illegitimate source.',
  literature:
    'Literature case: the adverse event or exposure was described in a published article or abstract.',
  none:
    'No pharmacovigilance relevance detected — nothing safety-reportable in this message.',

  // fact sections (Section 3D of the assignment + PQC / MI sections)
  patient: 'Patient details: age, sex, weight/height, relevant medical history.',
  reporter: 'Reporter: who reported the case, their role (e.g. physician), and country.',
  product: 'Product: name, dose, route of administration, start/stop dates.',
  reaction: 'Reaction: what happened, when it started, and the outcome.',
  severity: 'Severity / seriousness: was it serious — death, hospitalisation, life-threatening, disability.',
  narrative: 'Narrative: a short AI-written case summary in plain language.',
  complaint: 'Complaint (PQC): the product-quality problem — batch/lot number, what is wrong, packaging, contamination, whether a photo was mentioned.',
  inquiry: 'Inquiry (MI): the actual question(s) being asked and which product or topic they are about.',
  request: 'Request (MI): the actual question(s) being asked and which product or topic they are about.',

  // domain terms
  pharmacovigilance:
    'Pharmacovigilance (PV): the science of detecting, assessing, and preventing adverse effects of medicines once they are on the market.',
  triage:
    'Triage: quickly sorting incoming messages by type and urgency so the right ones reach a safety reviewer fast.',
  seriousness:
    'Seriousness: regulatory grading of an event — e.g. death, life-threatening, hospitalisation, disability, congenital anomaly.',
  causality:
    'Causality: the assessed likelihood that the medicine caused the event (e.g. certain, probable, possible, unlikely).',
  dechallenge:
    'Dechallenge: what happened to the reaction when the medicine was stopped or the dose reduced.',
  rechallenge:
    'Rechallenge: what happened when the medicine was given again after being stopped.',
  contact_dermatitis:
    'Contact dermatitis: skin inflammation (redness, itching, blistering) caused by something touching the skin.',
  dermatologist: 'Dermatologist: a doctor who specialises in skin, hair, and nail conditions.',
  ocr:
    'OCR (optical character recognition): software reading text out of a scanned image or photo.',
  injection:
    'Prompt injection: hidden text in a document that tries to make the AI ignore its instructions. Flagged content is still processed as data only.',
  uid:
    'Email UID: the mail server’s unique id for a message. Blank for messages imported from a file rather than fetched from a mailbox.',
  confidence:
    'Confidence: the model’s self-estimated certainty for a field or classification, from 0 to 1. Low values are worth a closer look.',
};

/** normalise a bucket/term to a glossary key */
export function glossaryKey(s: string): string {
  return (s || '').toLowerCase().trim().replace(/[\s.\-/]+/g, '_');
}
export function glossaryLookup(s: string): string | null {
  return GLOSSARY[glossaryKey(s)] || null;
}
