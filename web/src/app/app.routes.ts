import { Routes } from '@angular/router';
import { authGuard, moduleEnabled } from './core/guards';
import { ALL_FEATURES } from './features.registry';

// Route titles are translation keys (see core/title.ts).
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login').then((m) => m.Login), title: 'login.title' },
  { path: 'setup', loadComponent: () => import('./features/auth/setup').then((m) => m.Setup), title: 'setup.page_title' },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
      { path: 'account', loadComponent: () => import('./features/account/account').then((m) => m.Account), title: 'account.title' },
      // feature routes, each only when its PHP module is enabled
      ...ALL_FEATURES.map((f) => ({ path: '', canMatch: f.module ? [moduleEnabled(f.module)] : [], children: f.routes })),
    ],
  },
  { path: '**', loadComponent: () => import('./features/home/not-found').then((m) => m.NotFound), title: 'notfound.title' },
];
