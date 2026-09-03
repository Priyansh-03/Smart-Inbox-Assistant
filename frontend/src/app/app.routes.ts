import { Routes } from '@angular/router';
import { QueueComponent } from './queue.component';
import { DetailComponent } from './detail.component';

export const ROUTES: Routes = [
  { path: '', component: QueueComponent },
  { path: 'message/:id', component: DetailComponent },
  { path: '**', redirectTo: '' },
];
