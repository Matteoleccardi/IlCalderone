import { Component, computed, effect, inject, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { TPipe } from '../../core/i18n';
import { RecipeSummary } from '../../core/models';
import { Notify } from '../../core/notify';
import { FACET_ORDER, Facets, FacetsService, QUICK_MINUTES } from '../../core/facets';
import { FacetPicker } from '../../shared/facet-picker';
import { RecipeCard } from './recipe-card';

@Component({
  selector: 'app-recipe-list',
  imports: [FacetPicker, FormsModule, RouterLink, RecipeCard, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="page-head">
      <h1>{{ 'nav.recipes' | t }}</h1>
      <div class="actions">
        <a routerLink="/ricette/nuova" class="button primary">+ {{ 'recipes.new' | t }}</a>
        <a routerLink="/ricette/importa" class="button">{{ 'recipes.import_export' | t }}</a>
      </div>
    </div>
    <form class="search" (ngSubmit)="apply()" role="search">
      <input
        name="q"
        [(ngModel)]="text"
        [placeholder]="'recipes.search_placeholder' | t"
        [attr.aria-label]="'recipes.search' | t"
        (input)="typed()"
      />
      <label class="check"
        ><input
          type="checkbox"
          name="mine"
          [ngModel]="mine() === '1'"
          (ngModelChange)="toggleMine($event)"
        />
        {{ 'recipes.only_mine' | t }}</label
      >
      <button type="button" class="filter-toggle" [class.on]="showFilters()" [attr.aria-expanded]="showFilters()"
        (click)="showFilters.set(!showFilters())">
        ⚙ {{ 'facet.filters' | t }}@if (active().length) { <span class="count">{{ active().length }}</span> }
      </button>
    </form>
    @if (active().length) {
      <p class="facet-list active-filters">
        @for (a of active(); track a.name + a.value) {
          <button type="button" class="facet-chip on" (click)="drop(a.name, a.value)" [attr.aria-label]="'facet.remove' | t">
            {{ a.name === 'quick' ? '⚡ ' + ('facet.quick' | t) : ('facet.' + a.name + '.' + a.value | t) }} ✕
          </button>
        }
        <button type="button" class="link" (click)="clearFilters()">{{ 'facet.clear' | t }}</button>
      </p>
    }
    @if (showFilters() && defs(); as d) {
      <section class="card filters">
        <button type="button" class="chip-btn" [class.on]="quick() === '1'" [attr.aria-pressed]="quick() === '1'" (click)="toggleQuick()">
          ⚡ {{ 'facet.quick_long' | t: { n: quickMinutes } }}
        </button>
        <app-facet-picker [defs]="d" mode="filter" [value]="filters()" (valueChange)="setFilters($event)" />
      </section>
    }
    @if (loading()) {
      <p class="muted">{{ 'common.loading' | t }}</p>
    } @else if (recipes().length) {
      <p class="muted small">{{ 'recipes.count' | t: { n: recipes().length } }}</p>
      <div class="grid">
        @for (r of recipes(); track r.id) {
          <app-recipe-card [recipe]="r" />
        }
      </div>
    } @else {
      <p class="muted">{{ 'recipes.none_found' | t }}</p>
    }
  `,
})
export class RecipeList {
  /** Query params (bound by the router): ?q=…&mine=1 */
  readonly q = input<string>('');
  readonly mine = input<string>('');
  // facet filters, comma-separated: ?course=primo,secondo&diet=vegana…  and ?quick=1 (≤ 20 minutes)
  readonly course = input<string>('');
  readonly diet = input<string>('');
  readonly base = input<string>('');
  readonly dish = input<string>('');
  readonly serve = input<string>('');
  readonly season = input<string>('');
  readonly cuisine = input<string>('');
  readonly quick = input<string>('');
  protected quickMinutes = QUICK_MINUTES;
  private facetsSvc = inject(FacetsService);
  protected defs = this.facetsSvc.defs;
  protected showFilters = signal(false);
  /** The facet filters of the address, as lists. */
  protected filters = computed<Facets>(() => {
    const raw: Record<string, string> = {
      course: this.course(), diet: this.diet(), base: this.base(), dish: this.dish(),
      serve: this.serve(), season: this.season(), cuisine: this.cuisine(),
    };
    return Object.fromEntries(FACET_ORDER.map((k) => [k, (raw[k] ?? '').split(',').filter(Boolean)]));
  });
  /** Every active filter, for the removable chips. */
  protected active = computed(() => [
    ...FACET_ORDER.flatMap((name) => (this.filters()[name] as string[]).map((value) => ({ name, value }))),
    ...(this.quick() === '1' ? [{ name: 'quick', value: '1' }] : []),
  ]);
  protected text = '';
  protected recipes = signal<RecipeSummary[]>([]);
  protected loading = signal(true);
  private api = inject(Api);
  private router = inject(Router);
  private notify = inject(Notify);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.facetsSvc.ensure().catch(() => {});
    effect(() => {
      const q = this.q() ?? '';
      const mine = this.mine() === '1';
      const f = this.filters();
      const quick = this.quick() === '1';
      this.text = q;
      this.load(q, mine, f, quick);
    });
  }

  private async load(q: string, mine: boolean, f: Facets, quick: boolean): Promise<void> {
    this.loading.set(true);
    const params: Record<string, string | number | undefined> = { q, mine: mine ? 1 : undefined };
    for (const [k, v] of Object.entries(f)) if ((v as string[]).length) params[k] = (v as string[]).join(',');
    try {
      const list = await this.api.get<RecipeSummary[]>('recipes', params);
      this.recipes.set(quick ? list.filter((r) => !!r.time_minutes && r.time_minutes <= QUICK_MINUTES) : list);
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  typed(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.apply(), 300);
  }

  apply(): void {
    this.router.navigate([], {
      queryParams: { q: this.text || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setFilters(f: Facets): void {
    const queryParams: Record<string, string | null> = {};
    for (const k of FACET_ORDER) {
      const v = (f[k] as string[] | null) ?? [];
      queryParams[k] = v.length ? v.join(',') : null;
    }
    this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected drop(name: string, value: string): void {
    if (name === 'quick') return this.toggleQuick();
    const f = { ...this.filters() };
    f[name] = (f[name] as string[]).filter((v) => v !== value);
    this.setFilters(f);
  }

  protected clearFilters(): void {
    const queryParams: Record<string, null> = { quick: null };
    for (const k of FACET_ORDER) queryParams[k] = null;
    this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected toggleQuick(): void {
    this.router.navigate([], {
      queryParams: { quick: this.quick() === '1' ? null : 1 },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  toggleMine(on: boolean): void {
    this.router.navigate([], {
      queryParams: { mine: on ? 1 : null },
      queryParamsHandling: 'merge',
    });
  }
}
