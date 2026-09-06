import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ApiService } from './api.service';
import { glossaryKey, glossaryLookup } from './glossary';

@Component({
  selector: 'app-queue',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <h2>Review queue</h2>

    <div class="filters">
      <label class="f"><span>Status</span>
        <select [(ngModel)]="f.status" (ngModelChange)="reload()">
          <option value="">all</option>
          <option>READY_FOR_REVIEW</option><option>PROCESSING</option>
          <option>NEW</option><option>REVIEWED</option><option>FAILED</option>
        </select>
      </label>

      <label class="f"><span>Category</span>
        <select [(ngModel)]="f.category" (ngModelChange)="filterChanged()">
          <option value="">any</option>
          <option *ngFor="let c of allCategories" [value]="c">{{ c }}</option>
        </select>
      </label>

      <label class="f"><span>Search (from / subject)</span>
        <input [(ngModel)]="f.q" (ngModelChange)="queued('q')" placeholder="text…" size="18">
      </label>

      <label class="f"><span>Conf. ≥</span>
        <input type="number" min="0" max="1" step="0.05"
               [(ngModel)]="f.confMin" (ngModelChange)="queued('n')" size="4">
      </label>
      <label class="f"><span>Conf. ≤</span>
        <input type="number" min="0" max="1" step="0.05"
               [(ngModel)]="f.confMax" (ngModelChange)="queued('n')" size="4">
      </label>

      <label class="f"><span>Received from</span>
        <input type="date" [(ngModel)]="f.dateFrom" (ngModelChange)="filterChanged()">
      </label>
      <label class="f"><span>Received to</span>
        <input type="date" [(ngModel)]="f.dateTo" (ngModelChange)="filterChanged()">
      </label>

      <label class="f"><span>Only flagged</span>
        <input type="checkbox" [(ngModel)]="f.flaggedOnly" (ngModelChange)="filterChanged()">
      </label>

      <div class="spacer"></div>
      <button class="link" (click)="resetFilters()">clear filters</button>
    </div>

    <p class="muted">
      {{ view.length }} match{{ view.length === 1 ? '' : 'es' }} of {{ rows.length }}
      · auto-refresh 5s
    </p>

    <div class="tablewrap"><table>
      <thead><tr>
        <th class="num">#</th><th>From</th><th>Subject</th><th class="nowrap">Categories</th>
        <th class="num nowrap">Min conf.</th><th class="nowrap">Received</th><th>Status</th>
        <th class="num">ms</th><th></th>
      </tr></thead>
      <tbody>
        <tr *ngFor="let m of pageRows; trackBy: trackById">
          <td class="num muted">{{ m.id }}</td>
          <td>{{ m.sender }}</td>
          <td>{{ m.subject }} <span *ngIf="m.injectionFlagged" class="warn"
                title="{{ m.injectionNotes }}">⚠</span></td>
          <td>
            <span class="chip" [ngClass]="'cat-' + b.key" *ngFor="let b of m._buckets"
                  [attr.title]="b.tip">{{ b.name }}</span>
          </td>
          <td class="num" [class.low]="m.minConf !== null && m.minConf < 0.5">{{ m.minConf ?? '—' }}</td>
          <td class="muted">{{ m.receivedAt ? (m.receivedAt | date: 'short') : '—' }}</td>
          <td>
            <span class="pill"
              [class.ready]="m.status === 'READY_FOR_REVIEW'"
              [class.done]="m.status === 'REVIEWED'"
              [class.failed]="m.status === 'FAILED'"
              [class.other]="m.status === 'NEW' || m.status === 'PROCESSING'">{{ label(m.status) }}</span>
          </td>
          <td class="num">{{ m.processingMs ?? '—' }}</td>
          <td><a [routerLink]="['/message', m.id]">open →</a></td>
        </tr>
      </tbody>
    </table></div>
    <p *ngIf="!view.length" class="muted">No messages match these filters.</p>

    <div class="pager" *ngIf="view.length > pageSize">
      <button (click)="go(page - 1)" [disabled]="page === 0">← Prev</button>
      <span class="muted">
        {{ page * pageSize + 1 }}–{{ pageEnd }} of {{ view.length }}
        · page {{ page + 1 }} / {{ pageCount }}
      </span>
      <button (click)="go(page + 1)" [disabled]="page >= pageCount - 1">Next →</button>
    </div>
  `,
})
export class QueueComponent implements OnInit, OnDestroy {
  rows: any[] = [];
  view: any[] = [];         // all rows matching the filters
  pageRows: any[] = [];     // just the current page (max pageSize) — the only rows rendered
  allCategories: string[] = [];
  readonly pageSize = 10;
  page = 0;
  private timer: any;
  private debounce$ = new Subject<void>();

  get pageCount() { return Math.max(1, Math.ceil(this.view.length / this.pageSize)); }
  get pageEnd() { return Math.min((this.page + 1) * this.pageSize, this.view.length); }

  f = {
    status: '', category: '', q: '',
    confMin: null as number | null, confMax: null as number | null,
    dateFrom: '', dateTo: '', flaggedOnly: false,
  };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.debounce$.pipe(debounceTime(250)).subscribe(() => this.filterChanged());
    this.reload();
    this.timer = setInterval(() => this.reload(), 5000);
  }
  ngOnDestroy() { clearInterval(this.timer); this.debounce$.complete(); }

  trackById = (_: number, m: any) => m.id;
  queued(_: string) { this.debounce$.next(); }

  /** a filter control changed → back to page 1, then re-filter */
  filterChanged() { this.page = 0; this.apply(); }

  reload() {
    // status is the only server-side filter; the rest are applied client-side
    this.api.queue(this.f.status).subscribe((r) => {
      // precompute per-row bucket chips once, so the template does no work per change-detection
      for (const m of r) {
        m._buckets = (m.buckets || '')
          .split(',')
          .filter((x: string) => x)
          .map((name: string) => ({ name, key: glossaryKey(name), tip: glossaryLookup(name) }));
      }
      this.rows = r;
      const cats = new Set<string>();
      for (const m of r) for (const b of m._buckets) cats.add(b.name);
      this.allCategories = [...cats].sort();
      this.apply();
    });
  }

  apply() {
    const q = this.f.q.trim().toLowerCase();
    const from = this.f.dateFrom ? new Date(this.f.dateFrom + 'T00:00:00') : null;
    const to = this.f.dateTo ? new Date(this.f.dateTo + 'T23:59:59') : null;
    const cat = this.f.category;
    const { confMin, confMax, flaggedOnly } = this.f;
    this.view = this.rows.filter((m) => {
      if (cat && !m._buckets.some((b: any) => b.name === cat)) return false;
      if (q && !(`${m.sender} ${m.subject}`.toLowerCase().includes(q))) return false;
      if (flaggedOnly && !m.injectionFlagged) return false;
      if (confMin != null && !(m.minConf != null && m.minConf >= confMin)) return false;
      if (confMax != null && !(m.minConf != null && m.minConf <= confMax)) return false;
      if (from || to) {
        if (!m.receivedAt) return false;
        const d = new Date(m.receivedAt);
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      return true;
    });
    if (this.page > this.pageCount - 1) this.page = this.pageCount - 1;
    if (this.page < 0) this.page = 0;
    this.slice();
  }

  private slice() {
    const start = this.page * this.pageSize;
    this.pageRows = this.view.slice(start, start + this.pageSize);
  }

  go(p: number) {
    this.page = Math.min(Math.max(0, p), this.pageCount - 1);
    this.slice();
  }

  resetFilters() {
    this.page = 0;
    this.f = { status: '', category: '', q: '', confMin: null, confMax: null,
               dateFrom: '', dateTo: '', flaggedOnly: false };
    this.reload();
  }

  label(s: string): string {
    return { NEW: 'Queued', PROCESSING: 'Processing', READY_FOR_REVIEW: 'Awaiting review',
             REVIEWED: 'Reviewed ✓', FAILED: 'Failed' }[s] || s;
  }
}
