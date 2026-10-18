import { Feature } from '../../core/features';
import { adminGuard } from '../../core/guards';

export const adminFeature: Feature = {
  module: null,
  nav: [{ path: '/admin', label: 'nav.admin', admin: true }],
  routes: [{ path: 'admin', canActivate: [adminGuard], loadComponent: () => import('./admin').then((m) => m.Admin), title: 'nav.admin' }],
};
