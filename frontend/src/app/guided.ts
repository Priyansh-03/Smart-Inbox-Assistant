// Turns the flat fact list into the reviewer-facing "guided" summary shown on
// the message page. Read-only: full editing stays in the technical panel.

export interface GuidedFact { id: string; name: string; value: string; section: string; bucket: string; }

export interface Guided {
  patient: GuidedFact[];
  reporter: GuidedFact[];
  product: GuidedFact[];
  reaction: GuidedFact[];
  complaint: GuidedFact[];
  question: GuidedFact[];
  narrative: GuidedFact | null;
  hasAny: boolean;
}

const STATED = (v: string) => v && v.trim() && v.trim().toLowerCase() !== 'not stated';

export function buildGuided(facts: any[]): Guided {
  const pick = (section: string) => facts
    .filter((f) => (f.section || '').toUpperCase() === section)
    .map((f): GuidedFact => ({
      id: f.id,
      name: f.fieldName,
      value: f.reviewedValue ?? f.fieldValue ?? '',
      section: f.section,
      bucket: f.bucket,
    }));

  const narrativeFact = facts.find((f) => (f.fieldName || '').toLowerCase() === 'narrative');
  const g: Guided = {
    patient: pick('PATIENT').filter((f) => STATED(f.value)),
    reporter: pick('REPORTER').filter((f) => STATED(f.value)),
    product: pick('PRODUCT').filter((f) => STATED(f.value)),
    reaction: pick('REACTION').filter((f) => STATED(f.value)),
    complaint: pick('COMPLAINT').filter((f) => STATED(f.value)),
    question: pick('QUESTION').filter((f) => STATED(f.value)),
    narrative: narrativeFact && STATED(narrativeFact.reviewedValue ?? narrativeFact.fieldValue)
      ? { id: narrativeFact.id, name: 'narrative', section: 'NARRATIVE', bucket: narrativeFact.bucket,
          value: narrativeFact.reviewedValue ?? narrativeFact.fieldValue }
      : null,
    hasAny: false,
  };
  g.hasAny = !!(g.patient.length || g.reporter.length || g.product.length || g.reaction.length ||
                g.complaint.length || g.question.length || g.narrative);
  return g;
}

// value of one field by name within a GuidedFact[] (empty string if absent)
export function fieldValue(list: GuidedFact[], name: string): string {
  const f = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return f ? f.value : '';
}

// "29 yrs, Female" style one-liner from patient facts
export function patientLine(patient: GuidedFact[]): string {
  const age = fieldValue(patient, 'age').replace(/\s*(years?|yrs?)(\s*old)?\s*$/i, '').trim();
  const sex = fieldValue(patient, 'sex') || fieldValue(patient, 'gender');
  const bits: string[] = [];
  if (age) bits.push(`${age} yrs`);
  if (sex) bits.push(sex.charAt(0).toUpperCase() + sex.slice(1));
  return bits.join(', ') || 'Not stated';
}

// "Dr M. Silva — dermatologist, Portugal" from reporter facts
export function reporterLine(reporter: GuidedFact[]): string {
  const name = fieldValue(reporter, 'name');
  const role = fieldValue(reporter, 'role');
  const country = fieldValue(reporter, 'country');
  const tail = [role, country].filter(Boolean).join(', ');
  return [name, tail].filter(Boolean).join(' — ') || 'Not stated';
}

// { label, value } for every stated patient field, in a sensible order
const PATIENT_ORDER: Record<string, string> = {
  name: 'Name', age: 'Age', sex: 'Gender', gender: 'Gender',
  weight: 'Weight', height: 'Height', medical_history: 'Medical history',
};
export function patientRows(patient: GuidedFact[]): { label: string; value: string }[] {
  const order = Object.keys(PATIENT_ORDER);
  return patient
    .filter((f) => PATIENT_ORDER[f.name.toLowerCase()])
    .sort((a, b) => order.indexOf(a.name.toLowerCase()) - order.indexOf(b.name.toLowerCase()))
    .map((f) => ({
      label: PATIENT_ORDER[f.name.toLowerCase()],
      value: f.name.toLowerCase() === 'age'
        ? f.value.replace(/\s*(years?|yrs?)(\s*old)?\s*$/i, '').trim()
        : f.value,
    }));
}
