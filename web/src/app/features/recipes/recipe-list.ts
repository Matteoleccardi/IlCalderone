import { Component, computed, effect, inject, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { RatingsService } from '../../core/ratings';
import { I18n, TPipe } from '../../core/i18n';
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
      <div class="search-field">
        <input
          name="q"
          type="search"
          [(ngModel)]="text"
          [placeholder]="'recipes.search_placeholder' | t"
          [attr.aria-label]="'recipes.search' | t"
          (input)="typed()"
        />
        <button type="submit" class="search-go" [attr.aria-label]="'recipes.search' | t">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
        </button>
      </div>
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
        <span aria-hidden="true">⚙</span> {{ 'facet.filters' | t }}@if (active().length) { <span class="count">{{ active().length }}</span> }
      </button>
      @if (ratings.enabled()) {
        <select class="sort" name="ord" [attr.aria-label]="'recipes.sort' | t" [ngModel]="ord() || 'title'" (ngModelChange)="setOrd($event)">
          <option value="title">{{ 'recipes.sort_title' | t }}</option>
          <option value="taste">★ {{ 'recipes.sort_taste' | t }}</option>
          <option value="ease">▲ {{ 'recipes.sort_ease' | t }}</option>
        </select>
      }
    </form>
    @if (active().length) {
      <p class="facet-list active-filters">
        @for (a of active(); track a.name + a.value) {
          <button type="button" class="facet-chip on" (click)="drop(a.name, a.value)" [attr.aria-label]="chipLabel(a)">
            {{ chipText(a) }} <span aria-hidden="true">✕</span>
          </button>
        }
        <button type="button" class="link" (click)="clearFilters()">{{ 'facet.clear' | t }}</button>
      </p>
    }
    @if (showFilters() && defs(); as d) {
      <section class="card filters">
        <button type="button" class="chip-btn" [class.on]="quick() === '1'" [attr.aria-pressed]="quick() === '1'" (click)="toggleQuick()">
          <span aria-hidden="true">⚡</span> {{ 'facet.quick_long' | t: { n: quickMinutes } }}
        </button>
        @if (ratings.enabled()) {
          <div class="rate-filters">
            <label>{{ 'recipes.min_taste' | t }}
              <select name="mt" [ngModel]="mt()" (ngModelChange)="setMin('mt', $event)">
                @for (o of mins; track o) { <option [value]="o">{{ o ? '★ ≥ ' + o : ('rating.any' | t) }}</option> }
              </select>
            </label>
            <label>{{ 'recipes.min_ease' | t }}
              <select name="me" [ngModel]="me()" (ngModelChange)="setMin('me', $event)">
                @for (o of mins; track o) { <option [value]="o">{{ o ? '▲ ≥ ' + o : ('rating.any' | t) }}</option> }
              </select>
            </label>
          </div>
        }
        <app-facet-picker [defs]="d" mode="filter" [value]="filters()" (valueChange)="setFilters($event)" />
      </section>
    }
    @if (loading()) {
      <p class="muted">{{ 'common.loading' | t }}</p>
    } @else if (recipes().length) {
      <p class="muted small">{{ 'recipes.count' | t: { n: shown().length } }}</p>
      <div class="grid">
        @for (r of shown(); track r.id) {
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
  // ratings: ?ord=taste|ease (best first), ?mt=4 and ?me=3.5 (minimum taste / ease)
  readonly ord = input<string>('');
  readonly mt = input<string>('');
  readonly me = input<string>('');
  protected mins = ['', '3', '3.5', '4', '4.5'];
  protected ratings = inject(RatingsService);
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
    ...(this.mt() ? [{ name: 'mt', value: this.mt() }] : []),
    ...(this.me() ? [{ name: 'me', value: this.me() }] : []),
  ]);
  protected text = '';
  protected recipes = signal<RecipeSummary[]>([]);
  /** The list after the rating filters and the order (title order comes from the server). */
  protected shown = computed(() => {
    let list = this.recipes();
    const min = (key: 'taste' | 'ease', v: string) => {
      if (v) list = list.filter((r) => (this.ratings.score(r.id, key) ?? 0) >= Number(v));
    };
    min('taste', this.mt());
    min('ease', this.me());
    const by = this.ord() === 'taste' || this.ord() === 'ease' ? this.ord() as 'taste' | 'ease' : null;
    if (!by) return list;
    return [...list].sort((a, b) => (this.ratings.score(b.id, by) ?? -1) - (this.ratings.score(a.id, by) ?? -1));
  });
  protected loading = signal(true);
  private api = inject(Api);
  private i18n = inject(I18n);
  private router = inject(Router);
  private notify = inject(Notify);
  private timer?: ReturnType<typeof setTimeout>;

  /** The text of an active-filter chip. */
  protected chipText(a: { name: string; value: string }): string {
    if (a.name === 'mt') return '★ ≥ ' + a.value;
    if (a.name === 'me') return '▲ ≥ ' + a.value;
    return a.name === 'quick' ? '⚡ ' + this.i18n.t('facet.quick') : this.i18n.t('facet.' + a.name + '.' + a.value);
  }

  /** Its accessible name: says which filter it removes. */
  protected chipLabel(a: { name: string; value: string }): string {
    return this.i18n.t('facet.remove_named', { name: this.chipText(a) });
  }

  constructor() {
    this.facetsSvc.ensure().catch(() => {});
    this.ratings.ensure();
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
    if (name === 'mt' || name === 'me') return this.setMin(name, '');
    const f = { ...this.filters() };
    f[name] = (f[name] as string[]).filter((v) => v !== value);
    this.setFilters(f);
  }

  protected clearFilters(): void {
    const queryParams: Record<string, null> = { quick: null, mt: null, me: null };
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

  protected setOrd(v: string): void {
    this.router.navigate([], { queryParams: { ord: v === 'title' ? null : v }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected setMin(name: 'mt' | 'me', v: string): void {
    this.router.navigate([], { queryParams: { [name]: v || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  toggleMine(on: boolean): void {
    this.router.navigate([], {
      queryParams: { mine: on ? 1 : null },
      queryParamsHandling: 'merge',
    });
  }
}
