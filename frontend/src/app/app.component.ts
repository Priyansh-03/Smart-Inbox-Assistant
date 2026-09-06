import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <div class="bar">
      <a routerLink="/" class="brand">
        <span class="brand-co">Clinevo Technologies Pvt. Ltd.</span>
        <span class="brand-app">Smart Inbox Assistant · pharmacovigilance triage</span>
      </a>
      <span class="devmark">
        <span class="devmark-name">Built by Priyansh Srivastava</span>
        <a href="https://www.linkedin.com/in/priyansh-srivastava-aiml-developer/" target="_blank" rel="noopener">LinkedIn</a>
        <a href="https://github.com/Priyansh-03" target="_blank" rel="noopener">GitHub</a>
        <a href="/assets/Priyansh_Srivastava_Resume.pdf" target="_blank" rel="noopener">Résumé</a>
      </span>
    </div>
    <div class="wrap"><router-outlet></router-outlet></div>
  `,
})
export class AppComponent {}
