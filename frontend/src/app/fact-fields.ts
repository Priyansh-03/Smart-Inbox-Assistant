/**
 * Editor hints for extracted fact fields.
 *
 * The AI writes free text (including the literal "Not stated"). For fields whose
 * real-world domain is deterministic we still let the reviewer pick from a
 * constrained control instead of retyping — while always keeping "Not stated"
 * and the current AI value reachable so nothing is lost.
 */

export type FactEditor =
  | { kind: 'text' }
  | { kind: 'textarea' }
  | { kind: 'number'; min: number; max: number; step?: number; unit?: string }
  | { kind: 'select'; options: string[] };

const NOT_STATED = 'Not stated';

// field name (lower-case) -> editor
const BY_FIELD: Record<string, FactEditor> = {
  sex: { kind: 'select', options: ['F', 'M', 'Other', 'Unknown', NOT_STATED] },
  gender: { kind: 'select', options: ['Female', 'Male', 'Other', 'Unknown', NOT_STATED] },
  age: { kind: 'number', min: 0, max: 150, step: 1, unit: 'years' },
  route: {
    kind: 'select',
    options: ['Oral', 'Topical', 'Intravenous', 'Intramuscular', 'Subcutaneous',
              'Inhalation', 'Ophthalmic', 'Rectal', 'Other', NOT_STATED],
  },
  narrative: { kind: 'textarea' },
  defect_description: { kind: 'textarea' },
  reaction: { kind: 'textarea' },
  medical_history: { kind: 'textarea' },
  outcome: {
    kind: 'select',
    options: ['Recovered / resolved', 'Recovering / resolving', 'Not recovered / ongoing',
              'Recovered with sequelae', 'Fatal', 'Unknown', NOT_STATED],
  },
};

// yes/no-ish field name suffixes/keys -> tri-state select
const YESNO_KEYS = new Set([
  'contamination', 'packaging_issue', 'photo_mentioned', 'suspected_counterfeit',
  'death', 'disability', 'hospitalization', 'life_threatening',
  'medically_important', 'congenital_anomaly',
]);

/** Does the stored value look boolean? */
function looksBoolean(v: string): boolean {
  return ['true', 'false', 'yes', 'no'].includes((v || '').trim().toLowerCase());
}

export function editorFor(fieldName: string, currentValue: string): FactEditor {
  const key = (fieldName || '').toLowerCase();
  if (BY_FIELD[key]) return BY_FIELD[key];
  if (YESNO_KEYS.has(key) || looksBoolean(currentValue)) {
    return { kind: 'select', options: ['true', 'false', 'Unknown', NOT_STATED] };
  }
  return { kind: 'text' };
}

/** Long free-text values render better as a full-width textarea row. */
export function isLongText(fieldName: string, value: string): boolean {
  const e = editorFor(fieldName, value);
  if (e.kind === 'textarea') return true;
  return (value || '').length > 60;
}
