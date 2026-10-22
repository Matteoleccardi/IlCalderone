import { Feature } from './core/features';
import { adminFeature } from './features/admin/admin.feature';
import { collectionsFeature } from './features/collections/collections.feature';
import { householdsFeature } from './features/households/households.feature';
import { meallogFeature } from './features/meallog/meallog.feature';
import { menusFeature } from './features/menus/menus.feature';
import { ratingsFeature } from './features/ratings/ratings.feature';
import { recipesFeature } from './features/recipes/recipes.feature';
import { shoppingFeature } from './features/shopping/shopping.feature';

/** All front-end features, in navigation order. To add one: create features/<name>/<name>.feature.ts and list it here. */
export const ALL_FEATURES: Feature[] = [
  recipesFeature, ratingsFeature, menusFeature, shoppingFeature, collectionsFeature, meallogFeature, householdsFeature, adminFeature,
];
