import { Feature } from '../../core/features';
import { RecipeRatingView } from './recipe-rating';

/** Taste and ease ratings: a widget under the recipe title and a badge on the cards. No pages of its own. */
export const ratingsFeature: Feature = {
  module: 'ratings',
  routes: [],
  recipeMeta: [RecipeRatingView],
};
