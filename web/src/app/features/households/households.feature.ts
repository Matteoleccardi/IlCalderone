import { Feature } from '../../core/features';

export const householdsFeature: Feature = {
  module: null,
  nav: [{ path: '/famiglie', label: 'nav.households' }],
  routes: [{ path: 'famiglie', loadComponent: () => import('./households').then((m) => m.Households), title: 'nav.households' }],
};
