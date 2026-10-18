import { Feature } from '../../core/features';

export const shoppingFeature: Feature = {
  module: 'shopping',
  nav: [{ path: '/spesa', label: 'nav.shopping' }],
  routes: [{ path: 'spesa', loadComponent: () => import('./shopping-list').then((m) => m.ShoppingListPage), title: 'nav.shopping' }],
};
