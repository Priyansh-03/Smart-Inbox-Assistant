import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from './api.service';
import { glossaryKey, glossaryLookup } from './glossary';
import { editorFor, isLongText } from './fact-fields';
import { TooltipDirective } from './tooltip.directive';
import { parseSender } from './sender.util';
import { STATUS_LABEL, CATEGORY_LABEL } from './constants';
import { buildGuided, patientLine, reporterLine, patientRows, fieldValue, Guided } from './guided';
import { log } from './log';

@Component({
  selector: 'app-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TooltipDirective],
  template: `
    <p><button class="back" routerLink="/">← Back to queue</button></p>

    <div class="card head" *ngIf="data">
      <div class="hero-pills">
        <span class="catpill on" *ngFor="let b of appliesBuckets()" [ngClass]="'cat-' + key(b)"
              [tip]="tip(b)">{{ catLabel(b) }}</span>
        <span class="reviewstate">● {{ heroStatus() }}</span>
      </div>
      <h2>{{ data.message.subject || '(no subject)' }}</h2>
      <div class="metagrid muted">
        <div class="from">
          <b>From</b>
          <span class="from-name">{{ from.name }}</span>
          <span class="from-mail" *ngIf="from.email">{{ from.email }}</span>
        </div>
        <div><b>Date</b> {{ data.message.receivedAt ? (data.message.receivedAt | date: 'medium') : '—' }}</div>
        <div>
          <b><span class="term" [tip]="tip('uid')">UID</span></b>
          {{ data.message.emailUid || data.message.messageIdHdr || ('#' + data.message.id) }}
        </div>
        <div>
          <span class="pill"
            [class.ready]="data.message.status === 'READY_FOR_REVIEW'"
            [class.done]="data.message.status === 'REVIEWED'"
            [class.failed]="data.message.status === 'FAILED'"
            [class.other]="data.message.status === 'NEW' || data.message.status === 'PROCESSING'">
            {{ statusLabel(data.message.status) }}
          </span>
        </div>
      </div>
      <p *ngIf="data.message.injectionFlagged" class="banner">
        ⚠ Possible <span class="term" [tip]="tip('injection')">prompt-injection</span> content in this
        message — flagged for human review ({{ data.message.injectionNotes }}).
        The AI result was still produced from the document content only.
      </p>
    </div>

    <!-- document tabs: only when the message has 2+ attached documents -->
    <nav class="doctabs" *ngIf="data && tabs.length">
      <button *ngFor="let t of tabs" [class.on]="t.file === activeTab" (click)="selectTab(t.file)">
        📄 {{ t.file }}
      </button>
    </nav>

    <div class="review" *ngIf="data">
      <!-- LEFT: guided review -->
      <div class="reviewmain">

        <!-- hero: at-a-glance summary (active tab on multi-doc) -->
        <section class="hero">
          <div class="hero-block" *ngIf="situationText()">
            <div class="hero-head">
              <span class="isq">✉️</span>
              <h3>What happened?</h3>
            </div>
            <p class="hero-summary">{{ situationText() }}</p>
          </div>

          <div class="keydetails" *ngIf="hasKeyValues()">
            <div class="kd-head">
              <h4>Key details</h4>
            </div>
            <div class="kd-grid">
              <div class="kd-card" *ngFor="let c of keyCards()">
                <span class="isq sm">{{ c.icon }}</span>
                <span class="kd-label">{{ c.label }}</span>
                <ng-container [ngSwitch]="true">
                  <div *ngSwitchCase="!!c.rows" class="kd-rows">
                    <div class="kd-row" *ngFor="let r of c.rows">
                      <span class="kd-rk">{{ r.label }}</span>
                      <ul *ngIf="listItems(r.value).length > 1; else rvOne" class="kd-list tight">
                        <li *ngFor="let it of listItems(r.value)">{{ it }}</li>
                      </ul>
                      <ng-template #rvOne><span class="kd-rv">{{ r.value }}</span></ng-template>
                    </div>
                    <span class="kd-rv" *ngIf="!c.rows?.length">—</span>
                  </div>
                  <ul *ngSwitchCase="listItems(c.value).length > 1" class="kd-list">
                    <li *ngFor="let it of listItems(c.value)">{{ it }}</li>
                  </ul>
                  <span *ngSwitchDefault class="kd-value">{{ c.value || '—' }}</span>
                </ng-container>
              </div>
            </div>
          </div>

          <!-- flip card: what the AI saw in the active document -->
          <div class="aisaw" *ngIf="activeDoc()" [class.flipped]="aiFlipped"
               (click)="aiFlipped = !aiFlipped">
            <div class="aisaw-inner">
              <div class="aisaw-front">
                <span class="isq sm">👁</span>
                <span class="aisaw-title">What the AI saw</span>
                <span class="aisaw-file">{{ activeDoc().filename }}</span>
                <span class="aisaw-hint">tap to reveal →</span>
              </div>
              <div class="aisaw-back">
                <p class="aisaw-summary" *ngIf="activeDoc().summary">{{ activeDoc().summary }}</p>
                <div class="aisaw-img" *ngFor="let img of images(activeDoc())">
                  <b>{{ flagIcon(activeDoc(), img) }} {{ flagTitle(activeDoc(), img) }} — page {{ img.page }}, needs a human check.</b>
                  {{ flagBody(activeDoc(), img) }}
                  <div class="muted" *ngIf="img.description"><b>AI read it as:</b> {{ img.description }}</div>
                  <div class="muted" *ngIf="img.reviewer_note"><b>Note:</b> {{ img.reviewer_note }}</div>
                </div>
                <span class="aisaw-hint">← tap to close</span>
              </div>
            </div>
          </div>
        </section>

        <p class="tabhint muted" *ngIf="tabs.length">
          Showing details from <b>{{ activeTab }}</b>.
        </p>

        <!-- 2. Patient & Reporter -->
        <section class="gcard" *ngIf="guided.patient.length || guided.reporter.length">
          <div class="gcard-head">
            <h3>👤 Patient &amp; Reporter</h3>
          </div>
          <div class="pairs">
            <div *ngIf="guided.patient.length">
              <span class="k">Patient details</span>
              <span class="v">{{ patientLine(guided.patient) }}</span>
              <span class="sub" *ngIf="patientSub()">{{ patientSub() }}</span>
            </div>
            <div *ngIf="guided.reporter.length">
              <span class="k">Reported by</span>
              <span class="v">{{ reporterLine(guided.reporter) }}</span>
              <span class="sub" *ngIf="from.email">{{ from.email }}</span>
            </div>
          </div>
        </section>

        <!-- 3. Product & Packaging -->
        <section class="gcard" *ngIf="guided.product.length || guided.complaint.length">
          <div class="gcard-head">
            <h3>💊 Product &amp; Packaging</h3>
          </div>
          <div class="pairs">
            <div>
              <span class="k">Medicine name</span>
              <span class="v">{{ productName() || 'Not stated' }}</span>
              <span class="sub" *ngIf="field(guided.product,'dose')">Dose: {{ field(guided.product,'dose') }}</span>
            </div>
            <div *ngIf="field(guided.complaint,'batch_or_lot')">
              <span class="k">Batch / lot</span>
              <span class="chip mono">{{ field(guided.complaint,'batch_or_lot') }}</span>
            </div>
          </div>
          <div class="callout" *ngIf="field(guided.complaint,'defect_description')">
            <b>Physical issue observed:</b>
            {{ field(guided.complaint,'defect_description') }}
          </div>
        </section>

        <!-- MI: questions asked -->
        <section class="gcard" *ngIf="guided.question.length">
          <div class="gcard-head"><h3>❓ Questions asked</h3></div>
          <ul class="qlist">
            <li *ngFor="let q of questionItems()">{{ q }}</li>
          </ul>
          <p class="sub" *ngIf="field(guided.question,'product_or_topic')">
            About: {{ field(guided.question,'product_or_topic') }}
          </p>
        </section>

        <!-- nothing for this tab / message -->
        <section class="gcard muted" *ngIf="!guided.hasAny && !situationText()">
          <ng-container *ngIf="tabs.length">Nothing was extracted from this document.</ng-container>
          <ng-container *ngIf="!tabs.length">
            Nothing to extract — the assistant did not find pharmacovigilance-relevant details in this message.
          </ng-container>
        </section>

        <!-- technical panel -->
        <details class="gcard tech">
          <summary>View technical logs &amp; JSON</summary>

          <h4>Classification <span class="muted">(whole message)</span></h4>
          <div class="tablewrap"><table>
            <thead><tr><th>Category</th><th>Applies</th><th class="num">Conf.</th><th>Reason</th><th>Review</th></tr></thead>
            <tr *ngFor="let c of data.classifications">
              <td><span class="chip" [ngClass]="'cat-' + key(c.bucket)" [tip]="tip(c.bucket)">{{ c.bucket }}</span></td>
              <td><span class="chip yn" [class.yes]="c.applies" [class.no]="!c.applies">{{ c.applies ? 'yes' : 'no' }}</span></td>
              <td class="num" [class.low]="c.confidence != null && c.confidence < 0.5">{{ c.confidence ?? '—' }}</td>
              <td>{{ c.reason }}</td>
              <td class="nowrap">
                <button class="ok" (click)="setClass(c.bucket, true)">accept</button>
                <button class="danger" (click)="setClass(c.bucket, false)">override</button>
                <span *ngIf="c.reviewStatus !== 'AI'" class="muted"> {{ c.reviewStatus }}</span>
              </td>
            </tr>
          </table></div>

          <h4>Extracted facts
            <span class="muted" *ngIf="!tabs.length">({{ data.facts.length }} fields)</span>
            <span class="muted" *ngIf="tabs.length">— {{ activeTab }} + cross-document</span>
          </h4>
          <p class="muted" style="margin-top:0">Edit a value to override it.</p>
          <div class="factgroup" *ngFor="let g of visibleFactGroups()">
            <h5 class="srchead">
              <span *ngIf="g.type === 'pdf'">📄 <a href="javascript:void(0)" (click)="showPdf(g.file || '')">{{ g.file }}</a></span>
              <span *ngIf="g.type === 'email'">✉️ Email body</span>
              <span *ngIf="g.type === 'none'">🧩 Cross-document / no single source</span>
              <span class="muted"> · {{ g.facts.length }} field(s)</span>
            </h5>
            <div class="tablewrap"><table class="facts">
              <thead><tr>
                <th class="nowrap">Category</th><th class="nowrap">Section</th><th>Field</th>
                <th>Value <span class="muted">(edit to override)</span></th>
                <th class="num" [tip]="tip('confidence')"><span class="term">Conf.</span></th>
                <th class="nowrap">Page</th><th>Evidence</th>
              </tr></thead>
              <ng-container *ngFor="let f of g.facts">
                <tr *ngIf="!f._long" [class.changed-row]="edits[f.id] !== originals[f.id]">
                  <td class="nowrap"><span class="term" [tip]="tip(f.bucket)">{{ f.bucket }}</span></td>
                  <td class="nowrap"><span class="term" [tip]="tip(f.section)">{{ f.section }}</span></td>
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
                <ng-container *ngIf="f._long">
                  <tr class="longmeta" [class.changed-row]="edits[f.id] !== originals[f.id]">
                    <td class="nowrap"><span class="term" [tip]="tip(f.bucket)">{{ f.bucket }}</span></td>
                    <td class="nowrap"><span class="term" [tip]="tip(f.section)">{{ f.section }}</span></td>
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
            <span class="muted" *ngIf="changedCount()"> &nbsp;{{ changedCount() }} field(s) changed</span>
          </p>

          <h4>PDF document<span *ngIf="!tabs.length && data.pdfExtractions.length > 1">s</span></h4>
          <div *ngFor="let p of visiblePdfExtractions()" class="pdfblock">
            <b>{{ p.filename }}</b> — {{ p.flavor }} / {{ p.language }}
            <span *ngIf="p.ocrConfidence != null" class="muted">· <span class="term" [tip]="tip('ocr')">OCR</span> {{ p.ocrConfidence }}</span>
            <p>{{ p.summary }}</p>
            <div *ngFor="let img of images(p)" class="imgflag">
              {{ flagIcon(p, img) }} <b>{{ flagTitle(p, img) }} — page {{ img.page }}, needs a human check</b>.
              {{ flagBody(p, img) }}
              <div class="muted" *ngIf="img.description"><b>AI read it as:</b> {{ img.description }}</div>
              <div class="muted" *ngIf="img.reviewer_note"><b>Note:</b> {{ img.reviewer_note }}</div>
            </div>
          </div>
          <p class="muted" *ngIf="!data.pdfExtractions.length">No PDF attachments.</p>

          <h4>AI calls <span class="muted">({{ data.aiCalls?.length || 0 }})</span></h4>
          <div class="tablewrap"><table>
            <thead><tr><th>Step</th><th>Model</th><th>Prompt</th><th class="num">ms</th><th class="num">tokens</th><th>input hash</th><th>error</th></tr></thead>
            <tr *ngFor="let c of data.aiCalls">
              <td>{{ c.step }}</td><td>{{ c.model }}</td><td>{{ c.promptVersion }}</td>
              <td class="num">{{ c.durationMs }}</td><td class="num">{{ c.usage?.total_tokens ?? '—' }}</td>
              <td class="hash">{{ c.inputHash?.slice(0, 12) }}</td><td>{{ c.error }}</td>
            </tr>
          </table></div>

          <h4>Audit trail <span class="muted">({{ data.audit?.length || 0 }})</span></h4>
          <div class="tablewrap"><table>
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Old → New</th></tr></thead>
            <tr *ngFor="let a of data.audit">
              <td>{{ a.createdAt | date: 'short' }}</td><td>{{ a.actor }}</td>
              <td>{{ a.action }}</td><td>{{ a.target }}</td>
              <td><span *ngIf="a.oldValue || a.newValue">{{ a.oldValue }} → {{ a.newValue }}</span></td>
            </tr>
          </table></div>
        </details>

        <div class="approvebar">
          <span class="muted" *ngIf="changedCount()">{{ changedCount() }} unsaved field change(s)</span>
          <button *ngIf="data.message.status !== 'REVIEWED'" class="approve" (click)="approve()">
            ✓ Approve &amp; mark reviewed →
          </button>
          <button *ngIf="data.message.status === 'REVIEWED'" class="needreview" (click)="reopen()">
            ↺ Need review
          </button>
        </div>
      </div>

      <!-- RIGHT: source viewer — email body always on top, attachment (follows the active tab) below -->
      <aside class="reviewside">
        <div class="card">
          <h3 style="margin-top:0">Email body</h3>
          <pre>{{ data.message.bodyText || '(empty)' }}</pre>
        </div>
        <div class="card" *ngIf="pdfNames.length">
          <h3 style="margin-top:0">
            Attachment
            <span class="muted" *ngIf="tabs.length"> — {{ activeTab }}</span>
            <select *ngIf="pdfNames.length > 1 && !tabs.length" [(ngModel)]="selectedPdf" (ngModelChange)="showPdf($event)">
              <option *ngFor="let n of pdfNames" [value]="n">{{ n }}</option>
            </select>
          </h3>
          <iframe *ngIf="safeUrl" [src]="safeUrl"></iframe>
        </div>
        <p class="muted" *ngIf="!pdfNames.length" style="padding:0 4px">No PDF attachments.</p>
      </aside>
    </div>
  `,
})
export class DetailComponent implements OnInit {
  id!: string;
  data: any;
  from = { name: '', email: '' };
  guided: Guided = buildGuided([]);
  factGroups: { key: string; type: string; file?: string; facts: any[] }[] = [];
  tabs: { file: string }[] = [];
  activeTab = '';
  edits: Record<string, string> = {};
  originals: Record<string, string> = {};
  reason = '';
  aiFlipped = false;
  pdfNames: string[] = [];
  selectedPdf = '';
  safeUrl?: SafeResourceUrl;

  // exposed for the template
  patientLine = patientLine;
  reporterLine = reporterLine;

  constructor(private route: ActivatedRoute, private api: ApiService, private san: DomSanitizer) {}

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id')!;
    log.info(`opening message detail ${this.id}`);
    this.load();
  }

  load() {
    this.api.detail(this.id).subscribe((d) => {
      this.data = d;
      this.from = parseSender(d.message?.sender);
      this.edits = {};
      this.originals = {};
      for (const f of d.facts || []) {
        const v = f.reviewedValue ?? f.fieldValue ?? '';
        this.edits[f.id] = v;
        this.originals[f.id] = v;
      }
      this.factGroups = this.groupFacts(d.facts || []);
      this.pdfNames = (d.pdfExtractions || []).map((p: any) => p.filename);

      // tabs only when 2+ attached documents
      this.tabs = this.pdfNames.length >= 2 ? this.pdfNames.map((file) => ({ file })) : [];
      if (this.tabs.length && !this.tabs.some((t) => t.file === this.activeTab)) {
        this.activeTab = this.tabs[0].file;
      }
      if (!this.tabs.length) this.activeTab = '';

      this.recomputeGuided();
      if (this.pdfNames.length) {
        this.showPdf(this.tabs.length ? this.activeTab : this.pdfNames[0]);
      }
      log.info(`message ${this.id} loaded: ${d.facts?.length || 0} fact(s), ${this.pdfNames.length} pdf(s), ${this.tabs.length} tab(s), status ${d.message?.status}`);
    });
  }

  // facts scoped to the active tab (all facts when there are no tabs)
  private tabFacts(): any[] {
    if (!this.tabs.length) return this.data?.facts || [];
    return (this.data?.facts || []).filter((f: any) => f.source?.type === 'pdf' && f.source.file === this.activeTab);
  }
  private recomputeGuided() {
    this.guided = buildGuided(this.tabFacts());
  }

  selectTab(file: string) {
    if (file === this.activeTab) return;
    log.info(`message ${this.id}: switched to document ${file}`);
    this.activeTab = file;
    this.aiFlipped = false;
    this.recomputeGuided();
    this.showPdf(file);
  }
  // the PDF extraction bound to the current view (active tab, or the sole PDF)
  activeDoc(): any {
    const pdfs = this.data?.pdfExtractions || [];
    if (!pdfs.length) return null;
    return this.tabs.length ? pdfs.find((p: any) => p.filename === this.activeTab) : pdfs[0];
  }
  // technical panel: on a tabbed message show the active doc's group + the cross-document group
  visibleFactGroups() {
    if (!this.tabs.length) return this.factGroups;
    return this.factGroups.filter((g) => g.type === 'none' || g.file === this.activeTab);
  }
  visiblePdfExtractions(): any[] {
    if (!this.tabs.length) return this.data?.pdfExtractions || [];
    return (this.data?.pdfExtractions || []).filter((p: any) => p.filename === this.activeTab);
  }

  statusLabel(s: string): string { return STATUS_LABEL[s] || s; }
  catLabel(b: string): string { return CATEGORY_LABEL[b] || b; }
  field(list: any[], name: string): string { return fieldValue(list, name); }

  // ---- hero (at-a-glance) ----
  appliesBuckets(): string[] {
    return (this.data?.classifications || []).filter((c: any) => c.applies).map((c: any) => c.bucket);
  }
  heroStatus(): string {
    return this.data?.message?.status === 'REVIEWED' ? 'Reviewed' : 'Needs your review';
  }
  // 4 fixed cards; contents adapt to what the active tab / message actually holds.
  // a card is either {value} (one line) or {rows} (label:value list, e.g. Patient).
  keyCards(): { icon: string; label: string; value?: string; rows?: { label: string; value: string }[] }[] {
    const g = this.guided;
    const p = (name: string, list: any[]) => this.field(list, name);
    // on a tabbed message, pick the variant from THIS document's facts, not the whole-message buckets
    const has = this.tabs.length
      ? (b: string) => {
          if (b === 'ICSR') return !!(g.patient.length || g.reporter.length || g.reaction.length);
          if (b === 'PQC') return !!g.complaint.length;
          if (b === 'MI') return !!g.question.length;
          return false;
        }
      : (b: string) => this.appliesBuckets().includes(b);

    if (has('PQC') && !has('ICSR')) {
      return [
        { icon: '💊', label: 'Product', value: this.productName() },
        { icon: '🔖', label: 'Batch / lot', value: p('batch_or_lot', g.complaint) },
        { icon: '⚠️', label: 'Defect', value: p('defect_description', g.complaint) },
        { icon: '📷', label: 'Photo mentioned', value: this.ynLabel(p('photo_mentioned', g.complaint)) },
      ];
    }
    if (has('MI') && !has('ICSR')) {
      return [
        { icon: '💊', label: 'Product / topic', value: p('product_or_topic', g.question) },
        { icon: '❓', label: 'Questions', value: String(this.questionItems().length || '—') },
        { icon: '👤', label: 'Reporter', value: this.from.name },
        { icon: '📄', label: 'Source', value: this.tabs.length ? this.activeTab : (this.pdfNames[0] || 'Email') },
      ];
    }
    // ICSR (and default)
    return [
      { icon: '👤', label: 'Patient', rows: patientRows(g.patient) },
      { icon: '💊', label: 'Drug', value: this.field(g.product, 'product_name') },
      { icon: '⚠️', label: 'Reaction', value: this.field(g.reaction, 'reaction') },
      { icon: '✓', label: 'Outcome', value: this.field(g.reaction, 'outcome') },
    ];
  }
  hasKeyValues(): boolean {
    return this.keyCards().some((c) =>
      (c.value && c.value.trim()) || (c.rows && c.rows.length));
  }
  // split a "a, b; c" value into trimmed items (empty array for a single value)
  listItems(v?: string): string[] {
    if (!v) return [];
    const parts = v.split(/\s*[;,]\s*/).map((s) => s.trim()).filter(Boolean);
    return parts.length > 1 ? parts : [];
  }
  private ynLabel(v: string): string {
    const s = (v || '').trim().toLowerCase();
    if (s === 'true' || s === 'yes') return 'Yes';
    if (s === 'false' || s === 'no') return 'No';
    return v || '';
  }
  productName(): string {
    return this.field(this.guided.product, 'product_name') || this.field(this.guided.complaint, 'product_name');
  }
  patientSub(): string {
    return [
      this.field(this.guided.patient, 'weight') && `Weight: ${this.field(this.guided.patient, 'weight')}`,
      this.field(this.guided.patient, 'medical_history') && `History: ${this.field(this.guided.patient, 'medical_history')}`,
    ].filter(Boolean).join(' · ');
  }
  questionItems(): string[] {
    return this.guided.question.filter((f) => /^question/i.test(f.name)).map((f) => f.value);
  }
  situationText(): string {
    if (this.guided.narrative) return this.guided.narrative.value;
    if (this.tabs.length) {
      const p = this.activeDoc();
      if (p?.summary) return p.summary;
      const cross = (this.data?.facts || []).find((f: any) => !f.source && (f.fieldName || '').toLowerCase() === 'narrative');
      return cross ? (cross.reviewedValue ?? cross.fieldValue ?? '') : '';
    }
    return (this.data?.pdfExtractions || [])[0]?.summary || '';
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

  // pick a label that fits the flagged visual: scanned page / form / photo / figure
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
    return { scan: 'Scanned / handwritten page', form: 'Filled-in form',
             photo: 'Photograph', figure: 'Figure / embedded image' }[this.flagCat(p, img)];
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

  // Group facts by their source document (each PDF, the email body, or unknown).
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
    arr.sort((a, b) => {
      const w = (t: string) => (t === 'email' ? 0 : t === 'pdf' ? 1 : 2);
      return w(a.type) - w(b.type) || String(a.file || '').localeCompare(String(b.file || ''));
    });
    return arr;
  }

  setClass(bucket: string, applies: boolean) {
    log.info(`message ${this.id}: reviewer marks ${bucket} as ${applies ? 'applies' : 'does not apply'}`);
    this.api.setClassification(this.id, bucket, applies, this.reason).subscribe(() => this.load());
  }

  saveFacts() {
    const edits = Object.keys(this.edits)
      .filter((k) => this.edits[k] !== this.originals[k])
      .map((factId) => ({ factId, value: this.edits[factId] }));
    if (!edits.length) { log.info(`message ${this.id}: no field changes to save`); return; }
    log.info(`message ${this.id}: saving ${edits.length} field override(s)`);
    this.api.editFacts(this.id, edits).subscribe(() => this.load());
  }

  approve() {
    const edits = Object.keys(this.edits)
      .filter((k) => this.edits[k] !== this.originals[k])
      .map((factId) => ({ factId, value: this.edits[factId] }));
    const done = () => {
      log.info(`message ${this.id}: reviewer approves and marks it reviewed`);
      this.api.complete(this.id).subscribe(() => this.load());
    };
    if (edits.length) this.api.editFacts(this.id, edits).subscribe(done);
    else done();
  }

  reopen() {
    log.info(`message ${this.id}: reviewer sends it back to the review queue`);
    this.api.reopen(this.id).subscribe(() => this.load());
  }
}
