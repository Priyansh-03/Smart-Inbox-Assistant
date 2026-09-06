import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { COMPANY, DEVELOPER } from './constants';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <div class="bar">
      <a routerLink="/" class="brand">
        <img class="brand-logo" [src]="company.logo" [alt]="company.name" />
        <span class="brand-app">Smart Inbox Assistant · pharmacovigilance triage</span>
      </a>

      <span class="devmark">
        <span class="devmark-name">Built by {{ dev.name }}</span>
        <span class="devmark-links">
          <a [href]="dev.linkedin" target="_blank" rel="noopener">LinkedIn</a>
          <span class="sep">|</span>
          <a [href]="dev.github" target="_blank" rel="noopener">GitHub</a>
          <span class="sep">|</span>
          <a [href]="dev.resume" target="_blank" rel="noopener">Résumé</a>
        </span>
      </span>
    </div>
    <div class="wrap"><router-outlet></router-outlet></div>
  `,
})
export class AppComponent {
  company = COMPANY;
  dev = DEVELOPER;
}
