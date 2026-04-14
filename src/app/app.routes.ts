import { Routes } from '@angular/router';
import { AuthPageComponent } from './features/auth/auth-page.component';
import { DashboardPageComponent } from './features/dashboard/dashboard-page.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'index.html', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'app.html', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'login.html', pathMatch: 'full', redirectTo: 'login' },
  { path: 'signup.html', pathMatch: 'full', redirectTo: 'signup' },
  { path: 'login', component: AuthPageComponent, data: { mode: 'login' } },
  { path: 'signup', component: AuthPageComponent, data: { mode: 'signup' } },
  { path: 'dashboard', component: DashboardPageComponent },
  { path: '**', redirectTo: 'dashboard' },
];
