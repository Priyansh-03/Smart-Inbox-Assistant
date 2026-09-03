import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <div class="bar"><a routerLink="/" style="color:#fff;text-decoration:none">Smart Inbox Assistant</a></div>
    <div class="wrap"><router-outlet></router-outlet></div>
  `,
})
export class AppComponent {}
