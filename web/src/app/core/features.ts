import { InjectionToken, InputSignal, Type } from '@angular/core';
import { Routes } from '@angular/router';
import { Recipe } from './models';

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
