import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from './api.service';

@Component({
  selector: 'app-queue',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <h2>Review queue</h2>
    <p>
      <label>Status:
        <select (change)="reload($any($event.target).value)">
          <option value="">all</option>
          <option>READY_FOR_REVIEW</option><option>PROCESSING</option>
          <option>NEW</option><option>REVIEWED</option><option>FAILED</option>
        </select>
      </label>
    </p>
    <table>
      <thead><tr><th>From</th><th>Subject</th><th>Categories</th><th>Min conf.</th><th>Status</th><th>ms</th><th></th></tr></thead>
      <tbody>
        <tr *ngFor="let m of rows">
          <td>{{ m.sender }}</td>
          <td>{{ m.subject }} <span *ngIf="m.injectionFlagged" class="warn" title="{{ m.injectionNotes }}">⚠</span></td>
          <td><span class="chip" *ngFor="let b of buckets(m)">{{ b }}</span></td>
          <td [class.low]="m.minConf !== null && m.minConf < 0.5">{{ m.minConf ?? '-' }}</td>
          <td>{{ m.status }}</td>
          <td>{{ m.processingMs ?? '-' }}</td>
          <td><a [routerLink]="['/message', m.id]">open</a></td>
        </tr>
      </tbody>
    </table>
  `,
  styles: [`.warn { color: #b00020; font-weight: 700; }`],
})
export class QueueComponent implements OnInit, OnDestroy {
  rows: any[] = [];
  private timer: any;

  constructor(private api: ApiService) {}

  ngOnInit() { this.reload(''); this.timer = setInterval(() => this.reload(this.status), 5000); }
  ngOnDestroy() { clearInterval(this.timer); }

  status = '';
  reload(status: string) {
    this.status = status;
    this.api.queue(status).subscribe((r) => (this.rows = r));
  }
  buckets(m: any): string[] { return (m.buckets || '').split(',').filter((x: string) => x); }
}
