import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { HouseholdsService } from '../../core/households';
import { I18n, TPipe } from '../../core/i18n';
import { MEALS, Meal, Menu, MenuItem, RecipeSummary, Visibility } from '../../core/models';
import { Notify } from '../../core/notify';
import { AppTitle } from '../../core/title';
import { FileName } from '../../shared/file-name';
import { RecipeIcon } from '../../shared/recipe-icon';
import { Pick, RecipePicker } from '../../shared/recipe-picker';
import { ScopePicker } from '../../shared/scope-picker';

/**
 * Edit a menu: its settings and, week by week, the dishes of each day and meal. A cell can hold several dishes
 * (a recipe, or free text such as "pizza out"). Nothing is saved until "Save".
 */
@Component({
  selector: 'app-menu-edit',
  imports: [FormsModule, RouterLink, FileName, RecipeIcon, RecipePicker, ScopePicker, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (menu(); as m) {
      <p>
        <a routerLink="/menu"><span aria-hidden="true">←</span> {{ 'nav.menus' | t }}</a>
      </p>
      <div class="page-head">
        <h1>{{ name }}</h1>
        <span class="badge">{{
          visibility() === 'household' ? households.name(household()) : ('space.me' | t)
        }}</span>
      </div>
      @if (!m.can_edit) {
        <p class="muted">{{ 'menus.read_only' | t }}</p>
      }

      <details class="card" [open]="m.count === 0">
        <summary>{{ 'menus.settings' | t }}</summary>
        <div class="menu-settings">
          <label
            >{{ 'common.name' | t }}
            <input name="name" [(ngModel)]="name" (ngModelChange)="touch()" maxlength="120"
          /></label>
          <label
            >{{ 'common.description' | t }}
            <textarea
              name="notes"
              rows="2"
              [(ngModel)]="notes"
              (ngModelChange)="touch()"
            ></textarea>
          </label>
          @if (m.is_owner) {
            <app-scope-picker
              [(visibility)]="visibility"
              [(household)]="household"
              [allowShared]="false"
            />
          }
          <div class="row">
            <label
              >{{ 'menus.start' | t }}
              <input name="start" type="date" [(ngModel)]="start" (ngModelChange)="touch()"
            /></label>
            <label
              >{{ 'menus.weeks_label' | t }}
              <input
                name="weeks"
                type="number"
                min="1"
                max="12"
                [ngModel]="weeks()"
                (ngModelChange)="setWeeks($event)"
            /></label>
          </div>
          <p class="muted small">{{ 'menus.start_hint' | t }}</p>
          <fieldset class="meals-pick">
            <legend>{{ 'menus.meals' | t }}</legend>
            @for (x of allMeals; track x) {
              <label class="check"
                ><input type="checkbox" [checked]="meals().includes(x)" (change)="toggleMeal(x)" />
                {{ 'meal.' + x | t }}</label
              >
            }
          </fieldset>
          <div class="row">
            <label
              >{{ 'menus.season_from' | t }}
              <select name="sf" [(ngModel)]="seasonFrom" (ngModelChange)="touch()">
                <option [ngValue]="0">{{ 'menus.all_year' | t }}</option>
                @for (mo of months; track $index) {
                  <option [ngValue]="$index + 1">{{ mo }}</option>
                }
              </select>
            </label>
            @if (seasonFrom) {
              <label
                >{{ 'menus.season_to' | t }}
                <select name="st" [(ngModel)]="seasonTo" (ngModelChange)="touch()">
                  @for (mo of months; track $index) {
                    <option [ngValue]="$index + 1">{{ mo }}</option>
                  }
                </select>
              </label>
            }
          </div>
          <label class="check"
            ><input type="checkbox" name="active" [(ngModel)]="active" (ngModelChange)="touch()" />
            {{ 'menus.active' | t }}</label
          >
        </div>
      </details>

      <div class="tabs">
        @for (w of weekList(); track w) {
          <button
            type="button"
            [class.active]="w === week()"
            [attr.aria-pressed]="w === week()"
            (click)="week.set(w)"
          >
            {{ 'menus.week_n' | t: { n: w } }}
            @if (w === m.today.week && m.active && m.in_season) {
              · {{ 'menus.this_week' | t }}
            }
          </button>
        }
      </div>

      <div class="menu-grid" [style.--meals]="meals().length">
        <div class="head"></div>
        @for (x of meals(); track x) {
          <div class="head">{{ 'meal.' + x | t }}</div>
        }
        @for (dn of dayNames; track $index; let d = $index) {
          <div class="day-name" [class.today]="week() === m.today.week && d + 1 === m.today.day">
            {{ dn }}
          </div>
          @for (x of meals(); track x) {
            <div class="cell" [class.today]="week() === m.today.week && d + 1 === m.today.day">
              <span class="cell-label">{{ dn }} · {{ 'meal.' + x | t }}</span>
              @for (it of cell(d + 1, x); track $index) {
                <div class="dish">
                  @if (it.recipe) {
                    @if (it.available) {
                      <a class="with-icon" [routerLink]="['/ricette', it.recipe]"
                        ><app-recipe-icon [id]="it.recipe" [show]="byId().get(it.recipe)?.icon" [version]="byId().get(it.recipe)?.updated" />{{ it.title }}</a
                      >
                    } @else {
                      <span class="muted">{{ 'common.unavailable_recipe' | t }}</span>
                    }
                  } @else {
                    <span>{{ it.text }}</span>
                  }
                  @if (m.can_edit) {
                    @if (it.recipe) {
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        class="servings"
                        [(ngModel)]="it.servings"
                        (ngModelChange)="touch()"
                        [placeholder]="it.recipe_servings ?? ''"
                        [title]="'diary.servings' | t"
                        [attr.aria-label]="'menus.servings_of' | t: { name: dishName(it) }"
                      />
                    }
                    <button
                      type="button"
                      class="icon"
                      (click)="remove(it)"
                      [attr.aria-label]="'common.remove_named' | t: { name: dishName(it) }"
                    >
                      ✕
                    </button>
                  } @else if (it.servings) {
                    <span class="muted small">× {{ i18n.number(it.servings) }}</span>
                  }
                </div>
              }
              @if (m.can_edit) {
                <app-recipe-picker
                  [recipes]="candidates()"
                  [placeholder]="'menus.add_dish' | t"
                  [label]="'menus.add_dish_to' | t: { day: dn, meal: ('meal.' + x | t) }"
                  [dashed]="true"
                  (picked)="add(d + 1, x, $event)"
                />
              }
            </div>
          }
        }
      </div>
      <p class="muted small">{{ 'menus.grid_hint' | t }}</p>
      <p>
        <a class="button" [href]="api.url('menus/' + m.id + '/export')" download>{{ 'menuio.export_one' | t }}</a>
      </p>
      <app-file-name [id]="m.id" folder="menus" />

      @if (m.can_edit) {
        <div class="actions sticky">
          <button type="button" class="primary" (click)="save()" [disabled]="busy()">
            {{ (busy() ? 'common.saving' : 'common.save') | t }}
            @if (dirty()) {
              •
            }
          </button>
          <button type="button" class="danger" (click)="removeMenu()">
            {{ 'menus.delete' | t }}
          </button>
        </div>
      }
    } @else {
      <p class="muted">{{ 'common.loading' | t }}</p>
    }
  `,
})
export class MenuEdit {
  readonly id = input.required<string>();
  protected i18n = inject(I18n);
  protected households = inject(HouseholdsService);
  protected api = inject(Api);
  private notify = inject(Notify);
  private router = inject(Router);
  private title = inject(AppTitle);

  protected menu = signal<Menu | null>(null);
  protected items = signal<MenuItem[]>([]);
  protected recipes = signal<RecipeSummary[]>([]);
  protected week = signal(1);
  protected weeks = signal(4);
  protected meals = signal<Meal[]>(['cena']);
  protected visibility = signal<Visibility>('private');
  protected household = signal<string | null>(null);
  protected dirty = signal(false);
  protected busy = signal(false);
  protected name = '';
  protected notes = '';
  protected start = '';
  protected active = true;
  protected seasonFrom = 0; // month 1..12, 0 = all year
  protected seasonTo = 12;
  protected allMeals = MEALS;
  protected dayNames = this.i18n.weekdays('long');
  protected months = this.i18n.months();

  protected weekList = computed(() => Array.from({ length: this.weeks() }, (_, i) => i + 1));

  /** Recipe summaries by id (for the dishes' icons). */
  protected byId = computed(() => new Map(this.recipes().map((r) => [r.id, r])));

  /** Recipes that can go in this menu: in a household menu, only those every member can see. */
  protected candidates = computed(() => {
    const hh = this.visibility() === 'household' ? this.household() : null;
    return this.recipes().filter(
      (r) =>
        !hh || r.visibility === 'shared' || (r.visibility === 'household' && r.household === hh),
    );
  });

  constructor() {
    effect(() => {
      this.load(this.id());
    });
    this.households.ensure();
    this.api.get<RecipeSummary[]>('recipes').then(
      (r) => this.recipes.set(r),
      () => {},
    );
  }

  private async load(id: string): Promise<void> {
    try {
      this.set(await this.api.get<Menu>(`menus/${id}`));
    } catch (e) {
      this.notify.error(e);
      this.router.navigateByUrl('/menu');
    }
  }

  private set(m: Menu): void {
    this.menu.set(m);
    this.items.set(m.items.map((it) => ({ ...it })));
    this.name = m.name;
    this.notes = m.notes;
    this.start = m.start;
    this.active = m.active;
    this.weeks.set(m.weeks);
    this.meals.set(m.meals);
    this.visibility.set(m.visibility);
    this.household.set(m.household);
    this.seasonFrom = m.season ? Number(m.season.from.slice(0, 2)) : 0;
    this.seasonTo = m.season ? Number(m.season.to.slice(0, 2)) : 12;
    this.week.update((w) =>
      w > m.weeks ? 1 : m.active && m.in_season && !this.dirty() ? m.today.week : w,
    );
    this.dirty.set(false);
    this.title.set(m.name);
  }

  protected cell(day: number, meal: Meal): MenuItem[] {
    return this.items().filter(
      (it) => it.week === this.week() && it.day === day && it.meal === meal,
    );
  }

  /** What a dish is called for screen readers: its recipe title or its free text. */
  protected dishName(it: MenuItem): string {
    return it.recipe ? (it.title ?? this.i18n.t('common.unavailable_recipe')) : it.text;
  }

  protected touch(): void {
    this.dirty.set(true);
  }

  protected setWeeks(n: number): void {
    this.weeks.set(Math.max(1, Math.min(12, Number(n) || 1)));
    if (this.week() > this.weeks()) this.week.set(this.weeks());
    this.touch();
  }

  protected toggleMeal(m: Meal): void {
    const next = this.meals().includes(m)
      ? this.meals().filter((x) => x !== m)
      : MEALS.filter((x) => x === m || this.meals().includes(x));
    if (next.length) this.meals.set(next);
    this.touch();
  }

  /** A picked recipe, or free text. */
  protected add(day: number, meal: Meal, p: Pick): void {
    const r = p.recipe;
    const it: MenuItem = r
      ? {
          week: this.week(),
          day,
          meal,
          recipe: r.id,
          text: '',
          servings: null,
          title: r.title,
          available: true,
          recipe_servings: r.servings,
        }
      : { week: this.week(), day, meal, recipe: null, text: p.text, servings: null };
    this.items.update((l) => [...l, it]);
    this.touch();
  }

  protected remove(it: MenuItem): void {
    this.items.update((l) => l.filter((x) => x !== it));
    this.touch();
  }

  async save(): Promise<void> {
    const lastDay = (m: number) => new Date(2000, m, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    this.busy.set(true);
    try {
      this.set(
        await this.api.put<Menu>(`menus/${this.id()}`, {
          name: this.name,
          notes: this.notes,
          visibility: this.visibility(),
          household: this.household(),
          start: this.start,
          weeks: this.weeks(),
          meals: this.meals(),
          active: this.active,
          season: this.seasonFrom
            ? {
                from: `${pad(this.seasonFrom)}-01`,
                to: `${pad(this.seasonTo)}-${lastDay(this.seasonTo)}`,
              }
            : null,
          items: this.items().map(({ week, day, meal, recipe, text, servings }) => ({
            week,
            day,
            meal,
            recipe,
            text,
            servings,
          })),
        }),
      );
      this.notify.ok('menus.saved');
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  async removeMenu(): Promise<void> {
    if (!confirm(this.i18n.t('menus.confirm_delete', { name: this.name }))) return;
    try {
      await this.api.delete(`menus/${this.id()}`);
      this.router.navigateByUrl('/menu');
    } catch (e) {
      this.notify.error(e);
    }
  }
}
