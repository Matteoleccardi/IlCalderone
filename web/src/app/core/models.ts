// Shapes of the JSON returned by the PHP API (public/api). Keep in sync with schema/*.json.

export type Visibility = 'private' | 'household' | 'shared';

export interface User {
  id: string;
  username: string;
  display: string;
  admin: boolean;
  lang: string | null;
  created?: string;
}

export interface Session {
  version: string;
  needs_setup: boolean;
  user: User | null;
  modules: string[];
}

export interface Ingredient {
  name: string;
  qty: number | null; // null = q.b.
  unit: string;
  optional: boolean;
  note: string;
}

export interface Step {
  title: string;
  text: string;
}

export interface Scoped {
  visibility: Visibility;
  household: string | null;
}

export interface RecipeContent {
  title: string;
  servings: number;
  time_minutes: number | null;
  category: string;
  tags: string[];
  ingredients: Ingredient[];
  steps: Step[];
  notes: string;
  /** Where the recipe comes from (book, site…); optional. Shown as "Source: <creator>, from <taken_from>". */
  taken_from: string;
}

export interface ParentLink {
  id: string;
  kind: string;
  note?: string;
}

export interface Relative {
  id: string;
  title: string;
  kind: string;
  note?: string;
}

export interface Recipe extends RecipeContent, Scoped {
  format: string;
  id: string;
  photo: string | null;
  /** Pixel-art picture of the dish (<id>.icon.png), if any. */
  icon?: string | null;
  parents: ParentLink[];
  owner: string;
  created: string;
  updated: string;
  rev: number;
  updated_by: string | null;
  can_edit: boolean;
  is_owner: boolean;
  owner_name: string | null;
  updated_by_name: string | null;
  parents_info: Relative[];
  children_info: Relative[];
}

/** One entry of GET recipes/{id}/history (newest first). */
export interface Revision {
  rev: number;
  updated: string;
  updated_by: string | null;
  by_name: string | null;
  changes: string[];
  first: boolean;
  current: boolean;
}

export interface RecipeSummary extends Scoped {
  id: string;
  title: string;
  servings: number;
  time_minutes: number | null;
  category: string;
  tags: string[];
  ingredients: string[];
  owner: string;
  owner_name: string;
  parents: string[];
  photo: boolean;
  icon?: boolean;
  updated: string;
}

export interface Vocabulary {
  ingredients: string[];
  units: string[];
  categories: string[];
  tags: string[];
}

export interface Member {
  user: string;
  role: 'owner' | 'member';
  display: string | null;
}

export interface Household {
  id: string;
  name: string;
  members: Member[];
}

export interface CollectionSummary {
  id: string;
  name: string;
  description: string;
  count: number;
  visibility: Visibility;
  can_edit: boolean;
  owner_name: string | null;
  contains: boolean;
}

export interface CollectionItem {
  recipe: string;
  note: string;
  added: string;
  title: string | null;
  photo: boolean;
  available: boolean;
}

export interface Collection extends Scoped {
  id: string;
  name: string;
  description: string;
  owner: string;
  owner_name: string | null;
  can_edit: boolean;
  items: CollectionItem[];
}

export interface MealEntry {
  id: string;
  day: string;
  meal: string;
  recipe: string | null;
  title: string;
  servings: number | null;
  note: string;
  created: string;
  recipe_available?: boolean;
  user?: string;
  user_name?: string | null;
  mine?: boolean;
}

export interface Person {
  id: string;
  name: string | null;
}

export interface MealLog {
  entries: MealEntry[];
  top: { recipe: string; title: string; count: number }[];
  meals: string[];
  people: Person[];
}

/** Stored meal keys (translated as "meal.<key>"). */
export const MEALS = ['colazione', 'pranzo', 'cena', 'spuntino'] as const;
export type Meal = (typeof MEALS)[number];

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  params: Record<string, unknown>;
}

// ---------- menus ----------

export interface Season {
  from: string; // "MM-DD"
  to: string;
}

export interface MenuItem {
  week: number;
  day: number; // 1 = Monday … 7 = Sunday
  meal: Meal;
  recipe: string | null;
  text: string;
  servings: number | null;
  title?: string | null;
  available?: boolean;
  recipe_servings?: number | null;
}

export interface MenuSummary {
  id: string;
  name: string;
  notes: string;
  visibility: Visibility;
  household: string | null;
  household_name: string | null;
  start: string;
  weeks: number;
  meals: Meal[];
  season: Season | null;
  active: boolean;
  in_season: boolean;
  today: { week: number; day: number };
  count: number;
  can_edit: boolean;
  is_owner: boolean;
  owner_name: string | null;
}

export interface Menu extends MenuSummary {
  items: MenuItem[];
}

export interface PlanOption {
  menu: string;
  menu_name: string;
  space: string;
  space_name: string | null;
  recipe: string | null;
  title: string | null;
  available: boolean;
  photo: boolean;
  updated: string | null;
  text: string;
  servings: number | null;
}

export interface PlanDay {
  date: string;
  meals: { meal: Meal; options: PlanOption[] }[];
}

// ---------- shopping ----------

export interface Space {
  id: string; // "me" or a household id
  name: string | null;
}

export interface ShoppingItem {
  key: string;
  name: string;
  qty: number | null;
  unit: string;
  optional: boolean;
  mixed: boolean;
  checked: boolean;
  extra: boolean;
  id?: string;
  note?: string;
  by_name?: string | null;
  from: string[];
  sources: { recipe: string; title: string | null; day: string; meal: Meal; menu: string }[];
  household?: string;
  household_name?: string | null;
}

export interface ShoppingList {
  space: Space;
  spaces: Space[];
  week: string;
  prev: string;
  next: string;
  items: ShoppingItem[];
  moved: ShoppingItem[];
  pantry: string[];
}
