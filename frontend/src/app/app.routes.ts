import { Routes } from '@angular/router';
import { QueueComponent } from './queue.component';
import { DetailComponent } from './detail.component';
import { LiteratureComponent } from './literature.component';

export const ROUTES: Routes = [
  { path: '', component: QueueComponent },
  { path: 'literature', component: LiteratureComponent },
  { path: 'message/:id', component: DetailComponent },
  { path: '**', redirectTo: '' },
];
