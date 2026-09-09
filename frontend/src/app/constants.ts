// Fixed values shared across the app. Not secrets and not environment-varying
// (those go through env.ts). One place to change UI tuning and display labels.

// queue behaviour
export const PAGE_SIZE = 10;
export const QUEUE_REFRESH_MS = 5000;
export const FILTER_DEBOUNCE_MS = 250;

// detail payload cache (short-lived, per browser tab)
export const DETAIL_CACHE_TTL_MS = 15000;

// assistant-confidence banding: [0, LOW) low, [LOW, HIGH) medium, [HIGH, 1] high
export const CONFIDENCE_LOW = 0.5;
export const CONFIDENCE_HIGH = 0.8;

// friendly names for triage buckets the AI assigns
export const CATEGORY_LABEL: Record<string, string> = {
  ICSR: 'Safety report',
  PQC: 'Quality complaint',
  MI: 'Info request',
  NOT_RELEVANT: 'Not relevant',
};

// friendly names for message processing status
export const STATUS_LABEL: Record<string, string> = {
  NEW: 'Queued',
  PROCESSING: 'Processing',
  READY_FOR_REVIEW: 'Needs review',
  SEEN: 'Seen',
  REVIEWED: 'Reviewed',
  FAILED: 'Failed',
};

// developer attribution shown in the header (fixed, no rotation)
export const DEVELOPER = {
  name: 'Priyansh Srivastava',
  linkedin: 'https://www.linkedin.com/in/priyansh-srivastava-aiml-developer/',
  github: 'https://github.com/Priyansh-03',
  resume: '/assets/Priyansh_Srivastava_Resume.pdf',
};

export const COMPANY = {
  name: 'Clinevo Technologies',
  logo: '/assets/clinevo-logo.jpg',
};

// big title shown in the gradient band, chosen by the current route
export const PAGE_TITLES = {
  queue: 'Inbox',
  detail: 'Message',
};
