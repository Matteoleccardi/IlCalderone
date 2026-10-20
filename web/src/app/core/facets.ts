import { Injectable, inject, signal } from '@angular/core';
import { Api } from './api';

/** The fixed classification of a recipe (public/api/modules/recipes/facets.json). */
export interface FacetDef {
  multi: boolean;
  max: number | null;
  required: boolean;
  values: string[];
}
export type FacetDefs = Record<string, FacetDef>;

/** A recipe's values: a key (or null) for single facets, a list for multi ones. */
export type Facets = Record<string, string | string[] | null>;

/** Display order of the facets (the API returns the same). */
export const FACET_ORDER = ['course', 'diet', 'base', 'dish', 'serve', 'season', 'cuisine'];

/** A dish counts as quick at this many minutes or less (derived from the time, never stored). */
export const QUICK_MINUTES = 20;

/** The values of one facet as a list (single facets give 0 or 1 values). */
export function facetValues(f: Facets | null | undefined, name: string): string[] {
  const v = f?.[name];
  return Array.isArray(v) ? v : v ? [v] : [];
}

/** Empty values for every facet. */
export function blankFacets(defs: FacetDefs): Facets {
  return Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, d.multi ? [] : null]));
}

/** Required facets that are still empty. */
export function missingFacets(defs: FacetDefs, f: Facets): string[] {
  return Object.entries(defs)
    .filter(([k, d]) => d.required && facetValues(f, k).length === 0)
    .map(([k]) => k);
}

// ---- diet suggested from the ingredient names (Italian); the user confirms it ----

const MEAT = ['carne', 'manzo', 'maiale', 'vitello', 'pollo', 'tacchino', 'agnello', 'coniglio', 'anatra', 'salsicc', 'salam',
  'prosciutto', 'pancetta', 'guanciale', 'speck', 'bresaola', 'mortadella', 'wurstel', 'würstel', 'lardo', 'macinat',
  'cotechino', 'brodo di carne', 'bacon', 'chorizo', 'gelatina animale', 'strutto'];
const FISH = ['pesce', 'tonno', 'salmone', 'merluzzo', 'baccalà', 'stoccafisso', 'acciug', 'alici', 'sgombro', 'orata', 'branzino',
  'spigola', 'gamber', 'scamp', 'cozz', 'vongol', 'calamar', 'totan', 'polpo', 'seppi', 'sardin', 'trota', 'aringa', 'crostace',
  'colatura', 'bottarga', 'surimi', 'granchio', 'aragost', 'astice', 'capesant', 'ostric'];
const ANIMAL = ['uov', 'tuorl', 'album', 'latte', 'burro', 'formagg', 'parmigiano', 'grana', 'pecorino', 'mozzarell', 'ricotta',
  'panna', 'yogurt', 'mascarpone', 'gorgonzola', 'stracchino', 'miele', 'besciamella', 'scamorza', 'fontina', 'provola',
  'burrata', 'feta', 'caprino', 'emmental', 'groviera', 'taleggio', 'asiago', 'robiola', 'crescenza', 'philadelphia'];
/** Plant versions of animal foods ("latte di soia", "burro di arachidi"…). */
const PLANT = ['vegan', 'vegetal', 'di soia', 'di cocco', "d'avena", 'di avena', 'di mandorl', 'di riso', 'di arachid',
  'di cacao', 'di anacardi', 'di nocciol', 'di sesamo', 'tofu', 'tempeh', 'seitan'];

const has = (name: string, stems: string[]) => stems.some((s) => new RegExp(`(^|[^a-zàèéìòù])${s}`).test(name));

/** "carne", "pesce", "vegetariana" or "vegana" from the ingredients; null without ingredients. */
export function suggestDiet(ingredients: string[]): string | null {
  const names = ingredients.map((n) => n.toLowerCase().trim()).filter(Boolean);
  if (!names.length) return null;
  const animal = names.filter((n) => !has(n, PLANT));
  if (animal.some((n) => has(n, MEAT))) return 'carne';
  if (animal.some((n) => has(n, FISH))) return 'pesce';
  if (animal.some((n) => has(n, ANIMAL))) return 'vegetariana';
  return 'vegana';
}

/** The facet definitions, loaded once from the API. */
@Injectable({ providedIn: 'root' })
export class FacetsService {
  private api = inject(Api);
  readonly defs = signal<FacetDefs | null>(null);
  private loading?: Promise<FacetDefs>;

  ensure(): Promise<FacetDefs> {
    this.loading ??= this.api.get<FacetDefs>('recipes/facets').then((d) => {
      this.defs.set(d);
      return d;
    });
    return this.loading;
  }
}
