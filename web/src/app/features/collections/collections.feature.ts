import { Feature } from '../../core/features';
import { CollectionPanel } from './collection-panel';

export const collectionsFeature: Feature = {
  module: 'collections',
  nav: [{ path: '/raccolte', label: 'nav.collections' }],
  routes: [
    { path: 'raccolte', loadComponent: () => import('./collection-list').then((m) => m.CollectionList), title: 'nav.collections' },
    { path: 'raccolte/:id', loadComponent: () => import('./collection-detail').then((m) => m.CollectionDetail), title: 'collections.one' },
  ],
  recipePanels: [CollectionPanel],
};
