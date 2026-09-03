import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { ROUTES } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [provideRouter(ROUTES), provideHttpClient()],
}).catch((err) => console.error(err));
