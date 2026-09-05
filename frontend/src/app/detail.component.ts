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
    <p><b>From:</b> {{ data?.message?.sender }} &nbsp; <b>Status:</b> {{ data?.message?.status }}</p>

    <h3>Classification</h3>
    <table>
      <tr *ngFor="let c of data?.classifications">
        <td>{{ c.bucket }}</td>
        <td [class.low]="c.confidence < 0.5">{{ c.confidence }}</td>
        <td>{{ c.reason }}</td>
        <td>
          <button (click)="setClass(c.bucket, true)">accept</button>
          <button (click)="setClass(c.bucket, false)">reject</button>
          <span *ngIf="c.reviewStatus !== 'AI'">({{ c.reviewStatus }})</span>
        </td>
      </tr>
    </table>

    <div class="split">
      <div>
        <h3>Extracted facts</h3>
        <table>
          <thead><tr><th>Section</th><th>Field</th><th>Value</th><th>Conf.</th><th>Source</th></tr></thead>
          <tr *ngFor="let f of data?.facts">
            <td>{{ f.section }}</td>
            <td>{{ f.fieldName }}</td>
            <td><input [(ngModel)]="edits[f.id]" [placeholder]="f.reviewedValue || f.fieldValue" size="24"></td>
            <td [class.low]="f.confidence != null && f.confidence < 0.5">{{ f.confidence ?? '—' }}</td>
            <td>
              <a *ngIf="f.source?.type === 'pdf'" [href]="pdf(f.source.file, f.source.page)" target="_blank">
                {{ f.source.file }} p{{ f.source.page }}</a>
              <span *ngIf="f.source?.type === 'email'" title="{{ f.source?.quote }}">email</span>
            </td>
          </tr>
        </table>
        <p>
          <button (click)="saveFacts()">save edits</button>
          <button (click)="complete()">mark reviewed</button>
        </p>

        <h3>PDF summaries</h3>
        <div *ngFor="let p of data?.pdfExtractions">
          <b>{{ p.filename }}</b> — {{ p.flavor }} / {{ p.language }}
          <span *ngIf="p.ocrConfidence != null">(OCR {{ p.ocrConfidence }})</span>
          <p>{{ p.summary }}</p>
        </div>

        <h3>Audit</h3>
        <table>
          <tr *ngFor="let a of data?.audit">
            <td>{{ a.createdAt }}</td><td>{{ a.actor }}</td><td>{{ a.action }}</td><td>{{ a.target }}</td>
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
})
export class DetailComponent implements OnInit {
  id!: string;
  data: any;
  edits: Record<string, string> = {};
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

  pdf(file: string, page?: number) { return this.api.pdfUrl(this.id, file, page); }
  setClass(bucket: string, applies: boolean) {
    this.api.setClassification(this.id, bucket, applies).subscribe(() => this.load());
  }
  saveFacts() {
    const edits = Object.entries(this.edits)
      .filter(([, v]) => v != null && v !== '')
      .map(([factId, value]) => ({ factId, value }));
    if (edits.length) this.api.editFacts(this.id, edits).subscribe(() => this.load());
  }
  complete() { this.api.complete(this.id).subscribe(() => this.load()); }
}
