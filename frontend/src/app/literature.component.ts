import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from './api.service';
import { log } from './log';
import { LITERATURE_STEPS, LITERATURE_STEP_ADVANCE_MS } from './constants';

type StepState = 'pending' | 'active' | 'done' | 'error';

// ordered ICSR sections for the per-case facts table
const SECTION_ORDER = ['PATIENT', 'REPORTER', 'PRODUCT', 'REACTION', 'SERIOUSNESS', 'NARRATIVE'];

@Component({
  selector: 'app-literature',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="queue-head">
      <div class="queue-head-row">
        <h2>Screen article PDFs</h2>
        <a class="btn ghost" routerLink="/">Back to inbox</a>
      </div>
      <p class="muted sub">
        Upload one or more published articles. Each is checked for real, identifiable
        patient cases, split into separate cases, and given a summary and a relevance reason.
        These are not added to the mailbox.
      </p>
    </div>

    <div class="card">
      <div class="lit-drop"
           [class.over]="dragOver"
           (dragover)="onDragOver($event)" (dragleave)="dragOver = false" (drop)="onDrop($event)">
        <input #picker type="file" accept="application/pdf" multiple hidden (change)="onPick($event)" />
        <p><strong>Drop PDF files here</strong> or
          <button type="button" class="link" (click)="picker.click()">choose files</button>
        </p>
        <ul class="lit-files" *ngIf="files.length">
          <li *ngFor="let f of files">{{ f.name }} <span class="muted">({{ (f.size / 1024) | number:'1.0-0' }} KB)</span></li>
        </ul>
        <p class="err" *ngIf="pickError">{{ pickError }}</p>
      </div>
      <div class="lit-actions">
        <button class="btn primary" [disabled]="!files.length || running" (click)="analyze()">
          {{ running ? 'Analyzing…' : 'Analyze' }}
        </button>
        <button class="btn ghost" [disabled]="running" *ngIf="files.length" (click)="reset()">Clear</button>
      </div>
    </div>

    <div class="card stepper-card" *ngIf="running || done || errored">
      <ol class="stepper">
        <li class="step" *ngFor="let s of steps; let i = index"
            [class.is-active]="s.state === 'active'"
            [class.is-done]="s.state === 'done'"
            [class.is-error]="s.state === 'error'">
          <span class="step-dot">{{ s.state === 'done' ? '✓' : (i + 1) }}</span>
          <span class="step-text">
            <span class="step-label">{{ s.label }}</span>
            <span class="step-caption muted">{{ s.caption }}</span>
          </span>
          <span class="step-bar" *ngIf="i < steps.length - 1"><span class="step-bar-fill"></span></span>
        </li>
      </ol>
      <p class="err" *ngIf="errored">{{ errorMsg }} <button class="link" (click)="analyze()">Retry</button></p>
    </div>

    <div class="card lit-result" *ngFor="let r of results">
      <div class="lit-result-head">
        <h3>{{ r.screening.filename }}</h3>
        <span class="chip">{{ r.screening.flavor }}</span>
        <span class="chip">{{ r.screening.language }}</span>
        <span class="chip" [class.ok]="r.screening.has_patient_case" [class.no]="!r.screening.has_patient_case">
          {{ r.screening.has_patient_case ? 'Patient case found' : 'No reportable case' }}
        </span>
      </div>
      <p class="lit-summary">{{ r.screening.summary }}</p>
      <p class="muted"><strong>Why:</strong> {{ r.screening.relevance_reason }}</p>

      <div class="lit-case" *ngFor="let c of r.screening.cases">
        <div class="lit-case-head">
          <strong>{{ c.case_label }}</strong>
          <span class="chip" [class.ok]="c.reportable">{{ c.reportable ? 'Reportable' : 'Not reportable' }}</span>
          <a class="link" [routerLink]="['/message', r.messageId]">Open full record</a>
        </div>
        <details class="lit-case-text">
          <summary>Case passage</summary>
          <pre>{{ c.text }}</pre>
        </details>
        <table class="lit-facts" *ngIf="c.facts?.length">
          <ng-container *ngFor="let sec of sections(c.facts)">
            <tr class="lit-facts-sec"><th colspan="3">{{ sec }}</th></tr>
            <tr *ngFor="let f of factsIn(c.facts, sec)">
              <td>{{ f.field_name }}</td>
              <td [class.muted]="f.value === 'Not stated'">{{ f.value }}</td>
              <td class="num">{{ f.confidence == null ? '—' : (f.confidence | number:'1.0-2') }}</td>
            </tr>
          </ng-container>
        </table>
      </div>
    </div>
  `,
})
export class LiteratureComponent implements OnDestroy {
  files: File[] = [];
  pickError = '';
  dragOver = false;

  steps: { label: string; caption: string; state: StepState }[] = [];
  running = false;
  done = false;
  errored = false;
  errorMsg = '';
  results: any[] = [];

  private timer: any = null;

  constructor(private api: ApiService) {
    this.resetSteps();
  }

  ngOnDestroy() { this.clearTimer(); }

  onDragOver(e: DragEvent) { e.preventDefault(); this.dragOver = true; }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOver = false;
    this.take(Array.from(e.dataTransfer?.files ?? []));
  }

  onPick(e: Event) {
    this.take(Array.from((e.target as HTMLInputElement).files ?? []));
  }

  // keep only PDFs; report anything rejected
  private take(picked: File[]) {
    const pdfs = picked.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    const rejected = picked.length - pdfs.length;
    this.pickError = rejected ? `${rejected} file(s) ignored — only PDF is supported.` : '';
    if (pdfs.length) this.files = [...this.files, ...pdfs];
  }

  reset() {
    this.files = [];
    this.pickError = '';
    this.results = [];
    this.done = false;
    this.errored = false;
    this.resetSteps();
  }

  analyze() {
    if (!this.files.length || this.running) return;
    log.info(`literature: analyzing ${this.files.length} file(s)`);
    this.running = true;
    this.done = false;
    this.errored = false;
    this.results = [];
    this.resetSteps();
    this.steps[0].state = 'active';
    this.scheduleAdvance(0);

    this.api.screenLiterature(this.files).subscribe({
      next: (res) => {
        this.clearTimer();
        this.steps.forEach((s) => (s.state = 'done'));
        this.results = res ?? [];
        this.running = false;
        this.done = true;
        log.info(`literature: ${this.results.length} article(s) screened`);
      },
      error: (err) => {
        this.clearTimer();
        const active = this.steps.findIndex((s) => s.state === 'active');
        this.steps[Math.max(active, 0)].state = 'error';
        this.errorMsg = err?.error?.detail || err?.message || 'Screening failed.';
        this.running = false;
        this.errored = true;
        log.error(`literature: screening failed — ${this.errorMsg}`);
      },
    });
  }

  // walk the stepper forward on a timer, stopping with the last step still "active"
  private scheduleAdvance(i: number) {
    if (i >= this.steps.length - 1) return;
    this.timer = setTimeout(() => {
      this.steps[i].state = 'done';
      this.steps[i + 1].state = 'active';
      this.scheduleAdvance(i + 1);
    }, LITERATURE_STEP_ADVANCE_MS);
  }

  private clearTimer() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  private resetSteps() {
    this.steps = LITERATURE_STEPS.map((s) => ({ label: s.label, caption: s.caption, state: 'pending' as StepState }));
  }

  // sections present in a case's facts, in the canonical order
  sections(facts: any[]): string[] {
    const present = new Set(facts.map((f) => f.section));
    return SECTION_ORDER.filter((s) => present.has(s));
  }

  factsIn(facts: any[], section: string): any[] {
    return facts.filter((f) => f.section === section);
  }
}
