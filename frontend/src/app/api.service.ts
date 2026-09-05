import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from './env';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  queue(status?: string): Observable<any[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.http.get<any[]>(`${API_BASE}/api/messages${q}`);
  }

  detail(id: string): Observable<any> {
    return this.http.get<any>(`${API_BASE}/api/messages/${id}`);
  }

  setClassification(id: string, bucket: string, applies: boolean, reason = '') {
    return this.http.patch<void>(`${API_BASE}/api/messages/${id}/classification`, { bucket, applies, reason });
  }

  editFacts(id: string, edits: { factId: string; value: string }[]) {
    return this.http.patch<void>(`${API_BASE}/api/messages/${id}/facts`, edits);
  }

  complete(id: string) {
    return this.http.post<void>(`${API_BASE}/api/messages/${id}/complete`, {});
  }

  batchReport(): Observable<any> {
    return this.http.get<any>(`${API_BASE}/api/batch/report`);
  }

  pdfUrl(messageId: string, filename: string, page?: number): string {
    return `${API_BASE}/api/attachments/${messageId}/${encodeURIComponent(filename)}${page ? '#page=' + page : ''}`;
  }
}
