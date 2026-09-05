import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from './api.service';

@Component({
  selector: 'app-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h2>{{ data?.message?.subject }}</h2>
    <p>
      <b>From:</b> {{ data?.message?.sender }} &nbsp;
      <b>Date:</b> {{ data?.message?.receivedAt | date: 'medium' }} &nbsp;
      <b>Status:</b> {{ data?.message?.status }} &nbsp;
      <b>Processed in:</b> {{ data?.message?.processingMs }} ms
    </p>

    <p *ngIf="data?.message?.injectionFlagged" class="warn">
      ⚠ Possible prompt-injection content — needs human review ({{ data?.message?.injectionNotes }})
    </p>

    <h3>Classification</h3>
    <table>
      <thead><tr><th>Category</th><th>Applies</th><th>Confidence</th><th>Reason</th><th></th></tr></thead>
      <tr *ngFor="let c of data?.classifications">
        <td>{{ c.bucket }}</td>
        <td>{{ c.applies }}</td>
        <td [class.low]="c.confidence != null && c.confidence < 0.5">{{ c.confidence ?? '—' }}</td>
        <td>{{ c.reason }}</td>
        <td>
          <button (click)="setClass(c.bucket, true)">accept</button>
          <button (click)="setClass(c.bucket, false)">override</button>
          <span *ngIf="c.reviewStatus !== 'AI'"> ({{ c.reviewStatus }})</span>
        </td>
      </tr>
    </table>
    <p>Override reason (optional):
      <input [(ngModel)]="reason" size="40" placeholder="why you changed a classification"></p>

    <div class="split">
      <div>
        <h3>Extracted facts</h3>
        <table>
          <thead><tr><th>Section</th><th>Field</th><th>Value (edit to override)</th><th>Conf.</th><th>Source</th><th>Evidence</th></tr></thead>
          <tr *ngFor="let f of data?.facts">
            <td>{{ f.section }}</td>
            <td>{{ f.fieldName }}</td>
            <td><input [(ngModel)]="edits[f.id]" [placeholder]="f.reviewedValue || f.fieldValue" size="22"></td>
            <td [class.low]="f.confidence != null && f.confidence < 0.5">{{ f.confidence ?? '—' }}</td>
            <td>
              <a *ngIf="f.source?.type === 'pdf'" [href]="pdf(f.source.file, f.source.page)" target="_blank">
                {{ f.source.file }} p{{ f.source.page }}</a>
              <span *ngIf="f.source?.type === 'email'">email</span>
              <span *ngIf="!f.source">—</span>
            </td>
            <td class="evidence">{{ f.source?.quote }}</td>
          </tr>
        </table>
        <p>
          <button (click)="saveFacts()">save field overrides</button>
          <button (click)="complete()">mark reviewed</button>
        </p>

        <h3>PDF documents</h3>
        <div *ngFor="let p of data?.pdfExtractions" class="pdfblock">
          <b>{{ p.filename }}</b> — {{ p.flavor }} / {{ p.language }}
          <span *ngIf="p.ocrConfidence != null">· OCR confidence {{ p.ocrConfidence }}</span>
          <span *ngIf="p.injectionFlagged" class="warn"> · ⚠ injection flag</span>
          <p>{{ p.summary }}</p>
          <div *ngFor="let img of images(p)" class="imgflag">
            🖼 <b>image flagged for review</b> (p{{ img.page }}, {{ img.kind }}): {{ img.description }}
            <span *ngIf="img.reviewer_note"> — {{ img.reviewer_note }}</span>
          </div>
          <p *ngIf="p.originalText"><i>original (pre-translation) text retained</i></p>
        </div>

        <h3>AI calls ({{ data?.aiCalls?.length || 0 }})</h3>
        <table>
          <thead><tr><th>Step</th><th>Model</th><th>Prompt</th><th>ms</th><th>tokens</th><th>input hash</th><th>error</th></tr></thead>
          <tr *ngFor="let c of data?.aiCalls">
            <td>{{ c.step }}</td><td>{{ c.model }}</td><td>{{ c.promptVersion }}</td>
            <td>{{ c.durationMs }}</td><td>{{ c.usage?.total_tokens }}</td>
            <td class="hash">{{ c.inputHash?.slice(0, 12) }}</td><td>{{ c.error }}</td>
          </tr>
        </table>

        <h3>Audit trail</h3>
        <table>
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Old → New</th></tr></thead>
          <tr *ngFor="let a of data?.audit">
            <td>{{ a.createdAt | date: 'short' }}</td><td>{{ a.actor }}</td>
            <td>{{ a.action }}</td><td>{{ a.target }}</td>
            <td><span *ngIf="a.oldValue || a.newValue">{{ a.oldValue }} → {{ a.newValue }}</span></td>
          </tr>
        </table>
      </div>
      <div>
        <h3>Email body</h3>
        <pre style="white-space:pre-wrap">{{ data?.message?.bodyText }}</pre>
        <div *ngIf="firstPdf">
          <h3>{{ firstPdf }}</h3>
          <iframe *ngIf="safeUrl" [src]="safeUrl"></iframe>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .warn { color: #b00020; font-weight: 600; }
    .evidence { font-size: 12px; color: #444; max-width: 260px; }
    .hash { font-family: monospace; font-size: 12px; }
    .imgflag { background: #fff4e5; padding: 4px 8px; margin: 3px 0; font-size: 13px; }
    .pdfblock { border-top: 1px solid #eee; padding-top: 8px; margin-top: 8px; }
  `],
})
export class DetailComponent implements OnInit {
  id!: string;
  data: any;
  edits: Record<string, string> = {};
  reason = '';
  firstPdf = '';
  safeUrl?: SafeResourceUrl;

  constructor(private route: ActivatedRoute, private api: ApiService, private san: DomSanitizer) {}

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id')!;
    this.load();
  }

  load() {
    this.api.detail(this.id).subscribe((d) => {
      this.data = d;
      const p = d.pdfExtractions?.[0];
      if (p) {
        this.firstPdf = p.filename;
        this.safeUrl = this.san.bypassSecurityTrustResourceUrl(this.api.pdfUrl(this.id, p.filename));
      }
    });
  }

  images(p: any): any[] {
    try { return typeof p.images === 'string' ? JSON.parse(p.images) : (p.images || []); }
    catch { return []; }
  }

  pdf(file: string, page?: number) { return this.api.pdfUrl(this.id, file, page); }
  setClass(bucket: string, applies: boolean) {
    this.api.setClassification(this.id, bucket, applies, this.reason).subscribe(() => this.load());
  }
  saveFacts() {
    const edits = Object.entries(this.edits)
      .filter(([, v]) => v != null && v !== '')
      .map(([factId, value]) => ({ factId, value }));
    if (edits.length) this.api.editFacts(this.id, edits).subscribe(() => this.load());
  }
  complete() { this.api.complete(this.id).subscribe(() => this.load()); }
}
