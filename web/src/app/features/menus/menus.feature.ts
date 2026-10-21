import { unsavedGuard } from '../../core/guards';
import { Feature } from '../../core/features';
import { AddToMenu } from './add-to-menu';

export const menusFeature: Feature = {
  module: 'menus',
  nav: [{ path: '/menu', label: 'nav.menus' }],
  routes: [
    { path: 'menu', loadComponent: () => import('./menu-list').then((m) => m.MenuList), title: 'nav.menus' },
    { path: 'menu/:id', loadComponent: () => import('./menu-edit').then((m) => m.MenuEdit), title: 'menus.one', canDeactivate: [unsavedGuard] },
  ],
  recipeActions: [AddToMenu],
};
