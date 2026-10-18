import { Feature } from '../../core/features';
import { MeallogPanel } from './meallog-panel';

export const meallogFeature: Feature = {
  module: 'meallog',
  nav: [{ path: '/diario', label: 'nav.diary' }],
  routes: [{ path: 'diario', loadComponent: () => import('./diary').then((m) => m.Diary), title: 'diary.title' }],
  recipePanels: [MeallogPanel],
};
