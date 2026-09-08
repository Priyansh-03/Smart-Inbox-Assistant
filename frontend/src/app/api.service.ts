import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap, shareReplay } from 'rxjs/operators';
import { API_BASE } from './env';
import { DETAIL_CACHE_TTL_MS } from './constants';
import { log } from './log';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  // A message's full payload is fetched only when opened, then reused briefly (back/forward nav).
  private detailCache = new Map<string, { at: number; obs: Observable<any> }>();

  queue(status?: string): Observable<any[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.http.get<any[]>(`${API_BASE}/api/messages${q}`);
  }

  detail(id: string, force = false): Observable<any> {
    const hit = this.detailCache.get(id);
    if (!force && hit && Date.now() - hit.at < DETAIL_CACHE_TTL_MS) {
      log.info(`message ${id}: served from cache`);
      return hit.obs;
    }
    log.info(`message ${id}: fetching from server`);
    const obs = this.http.get<any>(`${API_BASE}/api/messages/${id}`).pipe(shareReplay(1));
    this.detailCache.set(id, { at: Date.now(), obs });
    return obs;
  }

  // drop a cached message so the next read is fresh (called after a write)
  invalidate(id: string) { this.detailCache.delete(id); }

  setClassification(id: string, bucket: string, applies: boolean, reason = '') {
    return this.http
      .patch<void>(`${API_BASE}/api/messages/${id}/classification`, { bucket, applies, reason })
      .pipe(tap(() => this.invalidate(id)));
  }

  editFacts(id: string, edits: { factId: string; value: string }[]) {
    return this.http
      .patch<void>(`${API_BASE}/api/messages/${id}/facts`, edits)
      .pipe(tap(() => this.invalidate(id)));
  }

  complete(id: string) {
    return this.http
      .post<void>(`${API_BASE}/api/messages/${id}/complete`, {})
      .pipe(tap(() => this.invalidate(id)));
  }

  reopen(id: string) {
    return this.http
      .post<void>(`${API_BASE}/api/messages/${id}/reopen`, {})
      .pipe(tap(() => this.invalidate(id)));
  }

  batchReport(): Observable<any> {
    return this.http.get<any>(`${API_BASE}/api/batch/report`);
  }

  pdfUrl(messageId: string, filename: string, page?: number): string {
    return `${API_BASE}/api/attachments/${messageId}/${encodeURIComponent(filename)}${page ? '#page=' + page : ''}`;
  }
}
