// API base URL is injected at container start into window.__API_BASE__ (see docker entrypoint).
// No hardcoded host: falls back to same-origin only when nothing is injected (local `ng serve` proxy).
declare global {
  interface Window { __API_BASE__?: string; }
}

export const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__) || '';
