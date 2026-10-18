import { Feature } from '../../core/features';

export const menusFeature: Feature = {
  module: 'menus',
  nav: [{ path: '/menu', label: 'nav.menus' }],
  routes: [
    { path: 'menu', loadComponent: () => import('./menu-list').then((m) => m.MenuList), title: 'nav.menus' },
    { path: 'menu/:id', loadComponent: () => import('./menu-edit').then((m) => m.MenuEdit), title: 'menus.one' },
  ],
};
