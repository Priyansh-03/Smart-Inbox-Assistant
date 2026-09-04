// API base URL is injected into window.__API_BASE__ at container start (docker-entrypoint.sh)
// or by `npm run prestart` for local `ng serve`. No default: a missing value is a hard error.
declare global {
  interface Window { __API_BASE__?: string; }
}

const injected = typeof window !== 'undefined' ? window.__API_BASE__ : undefined;
if (!injected) {
  throw new Error('API base URL not configured (window.__API_BASE__ is empty)');
}

export const API_BASE = injected;
