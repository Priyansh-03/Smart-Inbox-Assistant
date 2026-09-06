import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <div class="bar">
      <a routerLink="/" style="color:#fff">Smart Inbox Assistant</a>
      <span style="opacity:.7;font-weight:400"> &nbsp;·&nbsp; pharmacovigilance triage</span>
    </div>
    <div class="wrap"><router-outlet></router-outlet></div>
  `,
})
export class AppComponent {}
