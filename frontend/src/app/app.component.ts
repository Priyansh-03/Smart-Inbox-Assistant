import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { COMPANY, DEVELOPER, PAGE_TITLES } from './constants';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink],
  template: `
    <header class="topbar">
      <a routerLink="/" class="brand">
        <img class="brand-logo" [src]="company.logo" [alt]="company.name" />
      </a>
      <div class="devmark">
        <span class="devmark-name">Built by {{ dev.name }}</span>
        <span class="devmark-links">
          <a [href]="dev.linkedin" target="_blank" rel="noopener">LinkedIn</a>
          <span class="sep">|</span>
          <a [href]="dev.github" target="_blank" rel="noopener">GitHub</a>
          <span class="sep">|</span>
          <a [href]="dev.resume" target="_blank" rel="noopener">Résumé</a>
        </span>
      </div>
    </header>

    <div class="titlebar">
      <h1>{{ page.title }}</h1>
    </div>

    <div class="wrap"><router-outlet></router-outlet></div>
  `,
})
export class AppComponent {
  company = COMPANY;
  dev = DEVELOPER;

  page = { title: PAGE_TITLES.queue };

  constructor(router: Router) {
    router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(router.url),
    ).subscribe((url) => {
      this.page = { title: url.startsWith('/message') ? PAGE_TITLES.detail : PAGE_TITLES.queue };
    });
  }
}
