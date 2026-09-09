import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ApiService } from './api.service';
import { glossaryKey, glossaryLookup } from './glossary';
import { TooltipDirective } from './tooltip.directive';
import { parseSender } from './sender.util';
import { log } from './log';
import {
  PAGE_SIZE, QUEUE_REFRESH_MS, FILTER_DEBOUNCE_MS,
  CONFIDENCE_LOW, CONFIDENCE_HIGH, CATEGORY_LABEL, STATUS_LABEL,
} from './constants';

type ConfBand = '' | 'low' | 'medium' | 'high';

@Component({
  selector: 'app-queue',
  standalone: true,
  imports: [CommonModule, FormsModule, TooltipDirective],
  template: `
    <div class="queue-head">
      <h2>Messages to review</h2>
      <p class="muted sub">
        Emails and their attachments, sorted by the assistant. Open one to check its work.
        <span class="dot">·</span> updates automatically
      </p>
    </div>

    <div class="filters">
      <label class="f"><span>Show</span>
        <select [(ngModel)]="f.status" (ngModelChange)="reload()">
          <option value="">All messages</option>
          <option value="READY_FOR_REVIEW">Needs review</option>
          <option value="SEEN">Seen</option>
          <option value="REVIEWED">Reviewed</option>
          <option value="PROCESSING">Still processing</option>
          <option value="NEW">Queued</option>
          <option value="FAILED">Failed</option>
        </select>
      </label>

      <label class="f"><span>Category</span>
        <select [(ngModel)]="f.category" (ngModelChange)="filterChanged()">
          <option value="">Any category</option>
          <option *ngFor="let c of categoryChoices" [value]="c.slug">{{ c.label }}</option>
        </select>
      </label>

      <label class="f grow"><span>Search sender or subject</span>
        <input [(ngModel)]="f.q" (ngModelChange)="queued()" placeholder="Type a name, email or word…">
      </label>

      <div class="f"><span [tip]="tip('confidence')">Assistant confidence</span>
        <div class="segset">
          <button type="button" [class.on]="f.conf === ''" (click)="setConf('')">Any</button>
          <button type="button" [class.on]="f.conf === 'low'" (click)="setConf('low')">Low</button>
          <button type="button" [class.on]="f.conf === 'medium'" (click)="setConf('medium')">Medium</button>
          <button type="button" [class.on]="f.conf === 'high'" (click)="setConf('high')">High</button>
        </div>
      </div>

      <label class="f"><span>Received after</span>
        <input type="date" [(ngModel)]="f.dateFrom" (ngModelChange)="filterChanged()">
      </label>
      <label class="f"><span>Received before</span>
        <input type="date" [(ngModel)]="f.dateTo" (ngModelChange)="filterChanged()">
      </label>

      <label class="f check"><span>&nbsp;</span>
        <label class="inline">
          <input type="checkbox" [(ngModel)]="f.flaggedOnly" (ngModelChange)="filterChanged()">
          Only flagged messages
        </label>
      </label>

      <div class="spacer"></div>
      <button class="link" (click)="resetFilters()" *ngIf="anyFilter()">Clear filters</button>
    </div>

    <p class="muted count">
      <ng-container *ngIf="view.length === rows.length">Showing all {{ rows.length }} messages</ng-container>
      <ng-container *ngIf="view.length !== rows.length">
        {{ view.length }} of {{ rows.length }} messages match
      </ng-container>
    </p>

    <div class="tablewrap"><table class="queue">
      <thead><tr>
        <th>From</th><th>Subject</th><th>Category</th>
        <th class="nowrap" [tip]="'Whether the email has a PDF attachment.'">Document</th>
        <th class="nowrap" [tip]="tip('confidence')">Confidence</th>
        <th class="nowrap">Received</th>
        <th>Status</th><th></th>
      </tr></thead>
      <tbody>
        <tr *ngFor="let m of pageRows; trackBy: trackById" class="rowlink" (click)="open(m.id)">
          <td>
            <div class="who">{{ m._fromName }}</div>
            <div class="who-mail muted" *ngIf="m._fromMail">{{ m._fromMail }}</div>
          </td>
          <td>
            {{ m.subject || '(no subject)' }}
            <span *ngIf="m.injectionFlagged" class="flag"
                  [tip]="'This message contains text that tried to manipulate the assistant. It was flagged for a person to check. ' + (m.injectionNotes || '')">⚑ flagged</span>
          </td>
          <td>
            <span class="chip" [ngClass]="'cat-' + b.key" *ngFor="let b of m._buckets"
                  [tip]="b.tip">{{ b.label }} <span class="chip-code">({{ b.name }})</span></span>
            <span *ngIf="!m._buckets.length" class="muted">—</span>
          </td>
          <td>
            <span class="chip yn" [class.yes]="m.hasPdf" [class.no]="!m.hasPdf">
              {{ m.hasPdf ? 'Yes' : 'No' }}</span>
          </td>
          <td>
            <span class="conf" [ngClass]="'conf-' + m._confBand" *ngIf="m._confBand"
                  [tip]="confTip(m)">{{ confWord(m._confBand) }}</span>
            <span *ngIf="!m._confBand" class="muted">—</span>
          </td>
          <td class="muted nowrap">{{ m.receivedAt ? (m.receivedAt | date: 'MMM d, y') : '—' }}</td>
          <td>
            <span class="pill"
              [class.ready]="m.status === 'READY_FOR_REVIEW'"
              [class.seen]="m.status === 'SEEN'"
              [class.done]="m.status === 'REVIEWED'"
              [class.failed]="m.status === 'FAILED'"
              [class.other]="m.status === 'NEW' || m.status === 'PROCESSING'">{{ statusLabel(m.status) }}</span>
          </td>
          <td class="nowrap"><button class="open" (click)="open(m.id); $event.stopPropagation()">Open →</button></td>
        </tr>
      </tbody>
    </table></div>
    <p *ngIf="!view.length" class="muted empty">No messages match these filters.</p>

    <div class="pager" *ngIf="pageCount > 1">
      <button (click)="go(page - 1)" [disabled]="page === 0">← Previous</button>
      <span class="muted">Page {{ page + 1 }} of {{ pageCount }}</span>
      <button (click)="go(page + 1)" [disabled]="page >= pageCount - 1">Next →</button>
    </div>
  `,
})
export class QueueComponent implements OnInit, OnDestroy {
  rows: any[] = [];
  view: any[] = [];
  pageRows: any[] = [];
  categoryChoices: { slug: string; label: string }[] = [];
  readonly pageSize = PAGE_SIZE;
  page = 0;
  private timer: any;
  private debounce$ = new Subject<void>();

  get pageCount() { return Math.max(1, Math.ceil(this.view.length / this.pageSize)); }

  f = {
    status: '', category: '', q: '',
    conf: '' as ConfBand,
    dateFrom: '', dateTo: '', flaggedOnly: false,
  };

  constructor(private api: ApiService, private router: Router) {}

  open(id: string) { log.info(`opening message ${id}`); this.router.navigate(['/message', id]); }

  ngOnInit() {
    this.debounce$.pipe(debounceTime(FILTER_DEBOUNCE_MS)).subscribe(() => this.filterChanged());
    this.reload();
    this.timer = setInterval(() => this.reload(), QUEUE_REFRESH_MS);
  }
  ngOnDestroy() { clearInterval(this.timer); this.debounce$.complete(); }

  trackById = (_: number, m: any) => m.id;
  queued() { this.debounce$.next(); }
  filterChanged() { this.page = 0; this.apply(); }
  setConf(v: ConfBand) { this.f.conf = v; this.filterChanged(); }

  anyFilter(): boolean {
    const f = this.f;
    return !!(f.status || f.category || f.q || f.conf || f.dateFrom || f.dateTo || f.flaggedOnly);
  }

  reload() {
    this.api.queue(this.f.status).subscribe((r) => {
      const cats = new Set<string>();
      for (const m of r) {
        const slugs: string[] = (m.buckets || '').split(',').filter((x: string) => x);
        m._buckets = slugs.map((name) => ({
          name, key: glossaryKey(name),
          label: CATEGORY_LABEL[name] || name,
          tip: glossaryLookup(name),
        }));
        for (const s of slugs) cats.add(s);
        m._confBand = this.band(m.minConf);
        const parsed = parseSender(m.sender);
        m._fromName = parsed.name;
        m._fromMail = parsed.email;
      }
      this.rows = r;
      this.categoryChoices = [...cats].sort()
        .map((slug) => ({ slug, label: CATEGORY_LABEL[slug] || slug }));
      log.info(`queue loaded: ${r.length} message(s), status filter "${this.f.status || 'all'}"`);
      this.apply();
    });
  }

  apply() {
    const q = this.f.q.trim().toLowerCase();
    const from = this.f.dateFrom ? new Date(this.f.dateFrom + 'T00:00:00') : null;
    const to = this.f.dateTo ? new Date(this.f.dateTo + 'T23:59:59') : null;
    const { category, conf, flaggedOnly } = this.f;
    this.view = this.rows.filter((m) => {
      if (category && !m._buckets.some((b: any) => b.name === category)) return false;
      if (q && !(`${m.sender} ${m.subject}`.toLowerCase().includes(q))) return false;
      if (flaggedOnly && !m.injectionFlagged) return false;
      if (conf && m._confBand !== conf) return false;
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
    log.info(`filters applied: ${this.view.length} of ${this.rows.length} match, page ${this.page + 1}/${this.pageCount}`);
    this.slice();
  }

  private slice() {
    const start = this.page * this.pageSize;
    this.pageRows = this.view.slice(start, start + this.pageSize);
  }

  go(p: number) {
    this.page = Math.min(Math.max(0, p), this.pageCount - 1);
    log.info(`queue page -> ${this.page + 1}/${this.pageCount}`);
    this.slice();
  }

  resetFilters() {
    log.info('queue filters cleared');
    this.page = 0;
    this.f = { status: '', category: '', q: '', conf: '',
               dateFrom: '', dateTo: '', flaggedOnly: false };
    this.reload();
  }

  // decimal 0..1 -> low / medium / high band
  private band(v: number | null | undefined): ConfBand {
    if (v == null) return '';
    if (v < CONFIDENCE_LOW) return 'low';
    if (v < CONFIDENCE_HIGH) return 'medium';
    return 'high';
  }
  confWord(b: string): string { return { low: 'Low', medium: 'Medium', high: 'High' }[b] || ''; }
  confTip(m: any): string {
    const w = this.confWord(m._confBand);
    const pct = (m.minConf * 100).toFixed(0);
    const advice = m._confBand === 'low' ? 'Worth a close look.'
      : m._confBand === 'high' ? 'Likely accurate, still confirm.'
      : 'Give it a normal review.';
    return `${w} confidence — the assistant's lowest certainty on this message is ${pct}%. ${advice}`;
  }
  tip(s: string): string | null { return glossaryLookup(s); }
  statusLabel(s: string): string { return STATUS_LABEL[s] || s; }
}
