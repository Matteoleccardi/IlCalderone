import { InjectionToken, InputSignal, Type } from '@angular/core';
import { Routes } from '@angular/router';
import { Recipe, RecipeSummary } from './models';

/**
 * A front-end feature = one folder under features/, usually paired with a PHP module of the same name
 * (public/api/modules/<module>). It contributes lazy routes, navigation entries and optional panels shown
 * on the recipe page. Register it in app/features.registry.ts.
 */
export interface Feature {
  /** PHP module that must be enabled for the feature to appear (null = always on). */
  module: string | null;
  routes: Routes;
  nav?: NavItem[];
  /** Components rendered at the bottom of the recipe page; they receive the recipe as an input named "recipe". */
  recipePanels?: Type<RecipePanelComponent>[];
  /** Small buttons shown on every recipe card and in the recipe page's actions ("Add to menu"…). */
  recipeActions?: Type<RecipeActionComponent>[];
}

export interface NavItem {
  path: string;
  label: string;
  admin?: boolean;
}

export interface RecipePanelComponent {
  recipe: InputSignal<Recipe>;
}

export const FEATURES = new InjectionToken<Feature[]>('FEATURES');

/** The part of a recipe that both a card (RecipeSummary) and the recipe page (Recipe) have. */
export type RecipeRef = Pick<RecipeSummary, 'id' | 'title' | 'servings' | 'visibility' | 'household'>;

/** Inputs: recipe, and compact = true on cards (icon only). */
export interface RecipeActionComponent {
  recipe: InputSignal<RecipeRef>;
  compact: InputSignal<boolean>;
}
