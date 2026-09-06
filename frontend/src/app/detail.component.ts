import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from './api.service';
import { glossaryKey, glossaryLookup } from './glossary';
import { editorFor, isLongText } from './fact-fields';

@Component({
  selector: 'app-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <p><button class="back" routerLink="/">← Back to queue</button></p>

    <div class="card" *ngIf="data">
      <h2>{{ data.message.subject || '(no subject)' }}</h2>
      <p class="muted">
        <b>From</b> {{ data.message.sender }} &nbsp;·&nbsp;
        <b>Date</b> {{ data.message.receivedAt ? (data.message.receivedAt | date: 'medium') : '—' }} &nbsp;·&nbsp;
        <b><span class="term" [title]="tip('uid')">UID</span></b>
        {{ data.message.emailUid || data.message.messageIdHdr || ('#' + data.message.id) }} &nbsp;·&nbsp;
        <b>Processed</b> {{ data.message.processingMs ?? '—' }} ms
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
        ⚠ Possible <span class="term" [title]="tip('injection')">prompt-injection</span> content in this
        message — flagged for human review
        ({{ data.message.injectionNotes }}). The AI result was still produced from the document content only.
      </p>
    </div>

    <div class="card" *ngIf="data">
      <h3 style="margin-top:0">Classification</h3>
      <div class="tablewrap"><table>
        <thead><tr><th>Category</th><th>Applies</th><th class="num">Confidence</th><th>Reason</th><th>Review</th></tr></thead>
        <tr *ngFor="let c of data.classifications">
          <td>
            <span class="chip" [ngClass]="'cat-' + key(c.bucket)" [attr.title]="tip(c.bucket)">
              {{ c.bucket }}</span>
          </td>
          <td>
            <span class="chip yn" [class.yes]="c.applies" [class.no]="!c.applies">
              {{ c.applies ? 'yes' : 'no' }}</span>
          </td>
          <td class="num" [class.low]="c.confidence != null && c.confidence < 0.5">{{ c.confidence ?? '—' }}</td>
          <td>{{ c.reason }}</td>
          <td>
            <button class="ok" (click)="setClass(c.bucket, true)">accept</button>
            <button class="danger" (click)="setClass(c.bucket, false)">override</button>
            <span *ngIf="c.reviewStatus !== 'AI'" class="muted"> {{ c.reviewStatus }}</span>
          </td>
        </tr>
      </table></div>
      <p><label>Override reason (optional)
        <input [(ngModel)]="reason" size="46" placeholder="why you changed a classification"></label></p>
    </div>

    <div class="card" *ngIf="data">
      <h3 style="margin-top:0">Extracted facts <span class="muted">({{ data.facts.length }} fields)</span></h3>
      <p class="muted" style="margin-top:0">
        Grouped by <b>source</b> — each document (and the email body) is shown separately, since
        different attachments can describe different patients or cases.
      </p>

      <div class="factgroup" *ngFor="let g of factGroups">
        <h4 class="srchead">
          <span *ngIf="g.type === 'pdf'">
            📄 <a href="javascript:void(0)" (click)="showPdf(g.file || '')">{{ g.file }}</a>
          </span>
          <span *ngIf="g.type === 'email'">✉️ Email body</span>
          <span *ngIf="g.type === 'none'">
            🧩 Cross-document / no single source
            <span class="term muted" title="The AI did not tie these fields to one specific page — often a summary or a value combined from several places. Check them against the documents.">(?)</span>
          </span>
          <span class="muted"> · {{ g.facts.length }} field(s)</span>
        </h4>
        <div class="tablewrap"><table class="facts">
          <thead><tr>
            <th class="nowrap">Category</th><th class="nowrap">Section</th><th>Field</th>
            <th>Value <span class="muted">(edit to override)</span></th>
            <th class="num" [title]="tip('confidence')"><span class="term">Conf.</span></th>
            <th class="nowrap">Page</th><th>Evidence</th>
          </tr></thead>
          <ng-container *ngFor="let f of g.facts">
            <!-- short fields: inline control -->
            <tr *ngIf="!f._long" [class.changed-row]="edits[f.id] !== originals[f.id]">
              <td class="nowrap"><span class="term" [attr.title]="tip(f.bucket)">{{ f.bucket }}</span></td>
              <td class="nowrap"><span class="term" [attr.title]="tip(f.section)">{{ f.section }}</span></td>
              <td>{{ f.fieldName }}</td>
              <td>
                <ng-container [ngSwitch]="f._editor.kind">
                  <select *ngSwitchCase="'select'" class="factval"
                          [class.changed]="edits[f.id] !== originals[f.id]" [(ngModel)]="edits[f.id]">
                    <option *ngIf="!f._editor.options.includes(edits[f.id])" [value]="edits[f.id]">
                      {{ edits[f.id] || '(empty)' }}</option>
                    <option *ngFor="let o of f._editor.options" [value]="o">{{ o }}</option>
                  </select>
                  <span *ngSwitchCase="'number'" class="numwrap">
                    <input type="number" class="factval" [min]="f._editor.min" [max]="f._editor.max"
                           [step]="f._editor.step || 1"
                           [class.changed]="edits[f.id] !== originals[f.id]" [(ngModel)]="edits[f.id]">
                    <span class="muted" *ngIf="f._editor.unit">{{ f._editor.unit }}</span>
                  </span>
                  <input *ngSwitchDefault class="factval" [(ngModel)]="edits[f.id]"
                         [class.changed]="edits[f.id] !== originals[f.id]">
                </ng-container>
              </td>
              <td class="num" [class.low]="f.confidence != null && f.confidence < 0.5">{{ f.confidence ?? '—' }}</td>
              <td class="nowrap">
                <a *ngIf="f.source?.type === 'pdf' && f.source.page" href="javascript:void(0)"
                   (click)="showPdf(f.source.file, f.source.page)">p{{ f.source.page }}</a>
                <span *ngIf="!(f.source?.type === 'pdf' && f.source.page)" class="muted">—</span>
              </td>
              <td class="evidence">{{ f.source?.quote }}</td>
            </tr>

            <!-- long fields: meta row + full-width textarea row -->
            <ng-container *ngIf="f._long">
              <tr class="longmeta" [class.changed-row]="edits[f.id] !== originals[f.id]">
                <td class="nowrap"><span class="term" [attr.title]="tip(f.bucket)">{{ f.bucket }}</span></td>
                <td class="nowrap"><span class="term" [attr.title]="tip(f.section)">{{ f.section }}</span></td>
                <td>{{ f.fieldName }}</td>
                <td class="muted"><i>long text — edit below</i></td>
                <td class="num" [class.low]="f.confidence != null && f.confidence < 0.5">{{ f.confidence ?? '—' }}</td>
                <td class="nowrap">
                  <a *ngIf="f.source?.type === 'pdf' && f.source.page" href="javascript:void(0)"
                     (click)="showPdf(f.source.file, f.source.page)">p{{ f.source.page }}</a>
                  <span *ngIf="!(f.source?.type === 'pdf' && f.source.page)" class="muted">—</span>
                </td>
                <td class="evidence">{{ f.source?.quote }}</td>
              </tr>
              <tr class="longbody">
                <td colspan="7">
                  <textarea class="factarea" rows="4" [(ngModel)]="edits[f.id]"
                            [class.changed]="edits[f.id] !== originals[f.id]"></textarea>
                </td>
              </tr>
            </ng-container>
          </ng-container>
        </table></div>
      </div>

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
              <span *ngIf="p.ocrConfidence != null" class="muted">·
                <span class="term" [title]="tip('ocr')">OCR</span> {{ p.ocrConfidence }}</span>
              <span *ngIf="p.injectionFlagged" class="warn"> · ⚠</span>
            </summary>
            <p>{{ p.summary }}</p>
            <div *ngFor="let img of images(p)" class="imgflag">
              {{ flagIcon(p, img) }} <b>{{ flagTitle(p, img) }} — page {{ img.page }}, needs a human check</b>.
              {{ flagBody(p, img) }}
              <div class="muted" *ngIf="img.description"><b>AI read it as:</b> {{ img.description }}</div>
              <div class="muted" *ngIf="img.reviewer_note"><b>Note:</b> {{ img.reviewer_note }}</div>
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
  factGroups: { key: string; type: string; file?: string; facts: any[] }[] = [];
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
      this.factGroups = this.groupFacts(d.facts || []);
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

  /** Classify what the flagged visual content actually is, so the label fits. */
  private flagCat(p: any, img: any): 'scan' | 'form' | 'photo' | 'figure' {
    const flavor = (p.flavor || '').toUpperCase();
    const kind = (img.kind || '').toLowerCase();
    if (kind.includes('form') || kind.includes('checkbox')) return 'form';
    if (kind.includes('photo') || kind.includes('product') || kind.includes('rash')) return 'photo';
    if (flavor === 'SCANNED') return 'scan';
    return 'figure';
  }
  flagIcon(p: any, img: any): string {
    return { scan: '📝', form: '🗒️', photo: '📷', figure: '🖼' }[this.flagCat(p, img)];
  }
  flagTitle(p: any, img: any): string {
    return {
      scan: 'Scanned / handwritten page',
      form: 'Filled-in form',
      photo: 'Photograph',
      figure: 'Figure / embedded image',
    }[this.flagCat(p, img)];
  }
  flagBody(p: any, img: any): string {
    return {
      scan: 'This page was read by OCR / a vision model rather than as digital text, so the transcription can be imperfect — check the extracted fields below against the page.',
      form: 'The AI read a form or checkbox layout visually; confirm each captured field and tick-box matches the page.',
      photo: 'Deep image analysis was not performed — this is a good-faith description only. Confirm it against the picture in the viewer.',
      figure: 'Non-text content the AI described visually; confirm the extracted details match what it shows.',
    }[this.flagCat(p, img)];
  }

  key(s: string): string { return glossaryKey(s); }
  tip(s: string): string | null { return glossaryLookup(s); }

  /** Group facts by their source document (each PDF, the email body, or unknown). */
  private groupFacts(facts: any[]): { key: string; type: string; file?: string; facts: any[] }[] {
    const order = ['patient', 'reporter', 'product', 'reaction', 'severity', 'seriousness', 'narrative'];
    const rank = (s: string) => {
      const i = order.indexOf((s || '').toLowerCase());
      return i === -1 ? order.length : i;
    };
    const groups = new Map<string, { key: string; type: string; file?: string; facts: any[] }>();
    for (const f of facts) {
      const cur = f.reviewedValue ?? f.fieldValue ?? '';
      f._editor = editorFor(f.fieldName, cur);
      f._long = isLongText(f.fieldName, cur);
      const s = f.source;
      const type = !s ? 'none' : s.type === 'pdf' ? 'pdf' : s.type;
      const key = type === 'pdf' ? `pdf:${s.file}` : type;
      if (!groups.has(key)) groups.set(key, { key, type, file: s?.file, facts: [] });
      groups.get(key)!.facts.push(f);
    }
    const arr = [...groups.values()];
    for (const g of arr) {
      g.facts.sort((a, b) =>
        rank(a.section) - rank(b.section) ||
        String(a.fieldName).localeCompare(String(b.fieldName)));
    }
    // email body first, then PDFs by filename, unknown last
    arr.sort((a, b) => {
      const w = (t: string) => (t === 'email' ? 0 : t === 'pdf' ? 1 : 2);
      return w(a.type) - w(b.type) || String(a.file || '').localeCompare(String(b.file || ''));
    });
    return arr;
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
