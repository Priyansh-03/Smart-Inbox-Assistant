import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from './api.service';

@Component({
  selector: 'app-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <p><a routerLink="/">← back to queue</a></p>

    <div class="card" *ngIf="data">
      <h2>{{ data.message.subject || '(no subject)' }}</h2>
      <p class="muted">
        <b>From</b> {{ data.message.sender }} &nbsp;·&nbsp;
        <b>Date</b> {{ data.message.receivedAt | date: 'medium' }} &nbsp;·&nbsp;
        <b>UID</b> {{ data.message.emailUid || '—' }} &nbsp;·&nbsp;
        <b>Processed</b> {{ data.message.processingMs }} ms
      </p>
      <p>
        Status:
        <span class="pill"
          [class.ready]="data.message.status === 'READY_FOR_REVIEW'"
          [class.done]="data.message.status === 'REVIEWED'"
          [class.failed]="data.message.status === 'FAILED'"
          [class.other]="data.message.status === 'NEW' || data.message.status === 'PROCESSING'">
          {{ statusLabel(data.message.status) }}
        </span>
        <span class="muted"> ({{ data.message.status }})</span>
      </p>
      <p *ngIf="data.message.injectionFlagged" class="banner">
        ⚠ Possible prompt-injection content in this message — flagged for human review
        ({{ data.message.injectionNotes }}). The AI result was still produced from the document content only.
      </p>
    </div>

    <div class="card" *ngIf="data">
      <h3 style="margin-top:0">Classification</h3>
      <div class="tablewrap"><table>
        <thead><tr><th>Category</th><th>Applies</th><th class="num">Confidence</th><th>Reason</th><th>Review</th></tr></thead>
        <tr *ngFor="let c of data.classifications">
          <td><b>{{ c.bucket }}</b></td>
          <td>{{ c.applies ? 'yes' : 'no' }}</td>
          <td class="num" [class.low]="c.confidence != null && c.confidence < 0.5">{{ c.confidence ?? '—' }}</td>
          <td>{{ c.reason }}</td>
          <td>
            <button (click)="setClass(c.bucket, true)">accept</button>
            <button (click)="setClass(c.bucket, false)">override</button>
            <span *ngIf="c.reviewStatus !== 'AI'" class="muted"> {{ c.reviewStatus }}</span>
          </td>
        </tr>
      </table></div>
      <p><label>Override reason (optional)
        <input [(ngModel)]="reason" size="46" placeholder="why you changed a classification"></label></p>
    </div>

    <div class="card" *ngIf="data">
      <h3 style="margin-top:0">Extracted facts <span class="muted">({{ data.facts.length }} fields)</span></h3>
      <div class="tablewrap"><table class="facts">
        <thead><tr>
          <th>Category</th><th>Section</th><th>Field</th><th>Value <span class="muted">(edit to override)</span></th>
          <th class="num">Conf.</th><th>Source</th><th>Evidence</th>
        </tr></thead>
        <tr *ngFor="let f of data.facts">
          <td>{{ f.bucket }}</td>
          <td>{{ f.section }}</td>
          <td>{{ f.fieldName }}</td>
          <td><input class="factval" [(ngModel)]="edits[f.id]"
                     [class.changed]="edits[f.id] !== originals[f.id]"></td>
          <td class="num" [class.low]="f.confidence != null && f.confidence < 0.5">{{ f.confidence ?? '—' }}</td>
          <td>
            <a *ngIf="f.source?.type === 'pdf'" href="javascript:void(0)"
               (click)="showPdf(f.source.file, f.source.page)">{{ f.source.file }} p{{ f.source.page || '?' }}</a>
            <span *ngIf="f.source?.type === 'email'">email</span>
            <span *ngIf="!f.source" class="muted">—</span>
          </td>
          <td class="evidence">{{ f.source?.quote }}</td>
        </tr>
      </table></div>
      <p>
        <button (click)="saveFacts()">save field overrides</button>
        <button class="primary" (click)="complete()">mark reviewed</button>
        <span class="muted" *ngIf="changedCount()"> &nbsp;{{ changedCount() }} field(s) changed</span>
      </p>
    </div>

    <div class="split" *ngIf="data">
      <div class="main">
        <div class="card">
          <h3 style="margin-top:0">PDF documents</h3>
          <details *ngFor="let p of data.pdfExtractions" class="pdfblock" [open]="data.pdfExtractions.length === 1">
            <summary>
              <b>{{ p.filename }}</b> — {{ p.flavor }} / {{ p.language }}
              <span *ngIf="p.ocrConfidence != null" class="muted">· OCR {{ p.ocrConfidence }}</span>
              <span *ngIf="p.injectionFlagged" class="warn"> · ⚠</span>
            </summary>
            <p>{{ p.summary }}</p>
            <div *ngFor="let img of images(p)" class="imgflag">
              🖼 <b>image flagged for review</b> — p{{ img.page }}, {{ img.kind }}: {{ img.description }}
              <span *ngIf="img.reviewer_note"> ({{ img.reviewer_note }})</span>
            </div>
            <p *ngIf="p.originalText" class="muted"><i>original (pre-translation) text retained</i></p>
          </details>
        </div>

        <details class="card">
          <summary><b>AI calls</b> <span class="muted">({{ data.aiCalls?.length || 0 }})</span></summary>
          <div class="tablewrap"><table>
            <thead><tr><th>Step</th><th>Model</th><th>Prompt</th><th class="num">ms</th><th class="num">tokens</th><th>input hash</th><th>error</th></tr></thead>
            <tr *ngFor="let c of data.aiCalls">
              <td>{{ c.step }}</td><td>{{ c.model }}</td><td>{{ c.promptVersion }}</td>
              <td class="num">{{ c.durationMs }}</td><td class="num">{{ c.usage?.total_tokens ?? '—' }}</td>
              <td class="hash">{{ c.inputHash?.slice(0, 12) }}</td><td>{{ c.error }}</td>
            </tr>
          </table></div>
        </details>

        <details class="card">
          <summary><b>Audit trail</b> <span class="muted">({{ data.audit?.length || 0 }})</span></summary>
          <div class="tablewrap"><table>
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Old → New</th></tr></thead>
            <tr *ngFor="let a of data.audit">
              <td>{{ a.createdAt | date: 'short' }}</td><td>{{ a.actor }}</td>
              <td>{{ a.action }}</td><td>{{ a.target }}</td>
              <td><span *ngIf="a.oldValue || a.newValue">{{ a.oldValue }} → {{ a.newValue }}</span></td>
            </tr>
          </table></div>
        </details>
      </div>

      <div class="side">
        <div class="card">
          <h3 style="margin-top:0">
            Attachment
            <select *ngIf="pdfNames.length > 1" [(ngModel)]="selectedPdf" (ngModelChange)="showPdf($event)">
              <option *ngFor="let n of pdfNames" [value]="n">{{ n }}</option>
            </select>
          </h3>
          <p class="muted" *ngIf="pdfNames.length > 1">{{ pdfNames.length }} PDFs — pick one</p>
          <iframe *ngIf="safeUrl" [src]="safeUrl"></iframe>
          <p class="muted" *ngIf="!pdfNames.length">No PDF attachments.</p>
        </div>
        <details class="card">
          <summary><b>Email body</b></summary>
          <pre>{{ data.message.bodyText || '(empty)' }}</pre>
        </details>
      </div>
    </div>
  `,
})
export class DetailComponent implements OnInit {
  id!: string;
  data: any;
  edits: Record<string, string> = {};
  originals: Record<string, string> = {};
  reason = '';
  pdfNames: string[] = [];
  selectedPdf = '';
  safeUrl?: SafeResourceUrl;

  constructor(private route: ActivatedRoute, private api: ApiService, private san: DomSanitizer) {}

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id')!;
    this.load();
  }

  load() {
    this.api.detail(this.id).subscribe((d) => {
      this.data = d;
      // pre-fill the fact inputs with the current value (reviewed if any, else the AI value)
      this.edits = {};
      this.originals = {};
      for (const f of d.facts || []) {
        const v = f.reviewedValue ?? f.fieldValue ?? '';
        this.edits[f.id] = v;
        this.originals[f.id] = v;
      }
      this.pdfNames = (d.pdfExtractions || []).map((p: any) => p.filename);
      if (this.pdfNames.length && !this.pdfNames.includes(this.selectedPdf)) {
        this.showPdf(this.pdfNames[0]);
      }
    });
  }

  statusLabel(s: string): string {
    return { NEW: 'Queued', PROCESSING: 'Processing', READY_FOR_REVIEW: 'Awaiting review',
             REVIEWED: 'Reviewed ✓', FAILED: 'Failed' }[s] || s;
  }

  changedCount(): number {
    return Object.keys(this.edits).filter((k) => this.edits[k] !== this.originals[k]).length;
  }

  showPdf(name: string, page?: number) {
    this.selectedPdf = name;
    this.safeUrl = this.san.bypassSecurityTrustResourceUrl(this.api.pdfUrl(this.id, name, page));
  }

  images(p: any): any[] {
    try { return typeof p.images === 'string' ? JSON.parse(p.images) : (p.images || []); }
    catch { return []; }
  }

  setClass(bucket: string, applies: boolean) {
    this.api.setClassification(this.id, bucket, applies, this.reason).subscribe(() => this.load());
  }
  saveFacts() {
    const edits = Object.keys(this.edits)
      .filter((k) => this.edits[k] !== this.originals[k])
      .map((factId) => ({ factId, value: this.edits[factId] }));
    if (edits.length) this.api.editFacts(this.id, edits).subscribe(() => this.load());
  }
  complete() { this.api.complete(this.id).subscribe(() => this.load()); }
}
