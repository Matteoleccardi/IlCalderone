import { unsavedGuard } from '../../core/guards';
import { Feature } from '../../core/features';

export const recipesFeature: Feature = {
  module: 'recipes',
  nav: [{ path: '/ricette', label: 'nav.recipes' }],
  routes: [
    { path: 'ricette', loadComponent: () => import('./recipe-list').then((m) => m.RecipeList), title: 'nav.recipes' },
    { path: 'ricette/nuova', loadComponent: () => import('./recipe-form').then((m) => m.RecipeForm), title: 'recipes.new', canDeactivate: [unsavedGuard] },
    { path: 'ricette/importa', loadComponent: () => import('./recipe-import').then((m) => m.RecipeImport), title: 'import.title' },
    { path: 'ricette/:id', loadComponent: () => import('./recipe-detail').then((m) => m.RecipeDetail), title: 'recipe.title' },
    { path: 'ricette/:id/modifica', loadComponent: () => import('./recipe-form').then((m) => m.RecipeForm), title: 'form.edit_title', canDeactivate: [unsavedGuard] },
    { path: 'ricette/:id/cronologia', loadComponent: () => import('./recipe-history').then((m) => m.RecipeHistory), title: 'history.title' },
  ],
};
