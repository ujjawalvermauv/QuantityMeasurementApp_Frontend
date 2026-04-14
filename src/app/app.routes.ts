import { Routes } from '@angular/router';
import { AuthPageComponent } from './features/auth/auth-page.component';
import { DashboardPageComponent } from './features/dashboard/dashboard-page.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'login', component: AuthPageComponent, data: { mode: 'login' } },
  { path: 'signup', component: AuthPageComponent, data: { mode: 'signup' } },
  { path: 'dashboard', component: DashboardPageComponent },
  { path: '**', redirectTo: 'dashboard' },
];
