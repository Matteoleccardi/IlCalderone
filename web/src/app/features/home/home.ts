import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { I18n, TPipe } from '../../core/i18n';
import { MealEntry, MealLog, PlanDay, PlanOption, RecipeSummary } from '../../core/models';
import { Notify } from '../../core/notify';
import { SessionService } from '../../core/session';
import { today } from '../meallog/dates';
import { RecipeCard } from '../recipes/recipe-card';
import { RecipeIcon } from '../../shared/recipe-icon';

@Component({
  selector: 'app-home',
  imports: [FormsModule, RouterLink, RecipeCard, RecipeIcon, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="hero">
      <h1>{{ 'home.hello' | t: { name: $safeNavigationMigration(session.user()?.display) } }}</h1>
      <form class="search" (ngSubmit)="search()" role="search">
        <input
          name="q"
          [(ngModel)]="q"
          [placeholder]="'recipes.search_placeholder' | t"
          [attr.aria-label]="'recipes.search' | t"
        />
        <button type="submit" class="primary">{{ 'recipes.search' | t }}</button>
      </form>
      <p class="actions">
        <a routerLink="/ricette/nuova" class="button">+ {{ 'recipes.new' | t }}</a>
        @if (session.has('meallog')) {
          <a routerLink="/diario" class="button">{{ 'diary.title' | t }}</a>
        }
      </p>
    </section>

    @if (plan().length) {
      <section class="tonight">
        @for (d of plan(); track d.date; let first = $first) {
          <div class="card">
            <h2>
              {{ (first ? 'home.today' : 'home.tomorrow') | t }}
              <span class="muted small">{{
                i18n.date(d.date, { weekday: 'long', day: 'numeric', month: 'long' })
              }}</span>
            </h2>
            @for (m of d.meals; track m.meal) {
              <h3 class="meal-title">{{ 'meal.' + m.meal | t }}</h3>
              <ul class="plain options">
                @for (o of m.options; track $index) {
                  <li>
                    @if (o.recipe && o.available) {
                      <a class="with-icon" [routerLink]="['/ricette', o.recipe]"
                        ><app-recipe-icon [id]="o.recipe" [show]="o.icon" [version]="o.updated" />{{ o.title }}</a
                      >
                    } @else if (o.recipe) {
                      <span class="muted">{{ 'common.unavailable_recipe' | t }}</span>
                    } @else {
                      <span>{{ o.text }}</span>
                    }
                    <span class="badge"
                      >{{ o.space === 'me' ? ('space.me' | t) : o.space_name }} ·
                      {{ o.menu_name }}</span
                    >
                    @if (first && session.has('meallog') && (o.available || !o.recipe)) {
                      <button type="button" class="link" (click)="ate(o, m.meal)">
                        <span aria-hidden="true">🍽</span> {{ 'home.ate' | t }}
                      </button>
                    }
                  </li>
                }
              </ul>
            } @empty {
              <p class="muted small">{{ 'home.nothing_planned' | t }}</p>
            }
          </div>
        }
      </section>
    }

    <section>
      <h2>{{ 'home.latest' | t }}</h2>
      @if (recent().length) {
        <div class="grid">
          @for (r of recent(); track r.id) {
            <app-recipe-card [recipe]="r" />
          }
        </div>
        <p>
          <a routerLink="/ricette">{{ 'home.all_recipes' | t: { n: total() } }} →</a>
        </p>
      } @else {
        <p class="muted">
          {{ 'home.none_yet' | t }}
          <a routerLink="/ricette/nuova">{{ 'home.write_first' | t }}</a> ·
          <a routerLink="/ricette/importa">{{ 'home.import_file' | t }}</a>
        </p>
      }
    </section>

    @if (meals().length) {
      <section>
        <h2>{{ 'home.latest_meals' | t }}</h2>
        <ul class="plain">
          @for (m of meals(); track m.id) {
            <li>
              <span class="muted"
                >{{ i18n.date(m.day, { day: 'numeric', month: 'short' }) }} ·
                {{ 'meal.' + m.meal | t }}</span
              >
              —
              @if (m.recipe && m.recipe_available) {
                <a [routerLink]="['/ricette', m.recipe]">{{ m.title }}</a>
              } @else {
                {{ m.title }}
              }
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class Home implements OnInit {
  protected session = inject(SessionService);
  protected i18n = inject(I18n);
  private api = inject(Api);
  private router = inject(Router);
  private notify = inject(Notify);
  protected q = '';
  protected recent = signal<RecipeSummary[]>([]);
  protected total = signal(0);
  protected meals = signal<MealEntry[]>([]);
  protected plan = signal<PlanDay[]>([]);

  async ngOnInit(): Promise<void> {
    if (this.session.has('menus')) {
      this.api.get<{ days: PlanDay[] }>('menus/plan', { from: today(), days: 2 }).then(
        (p) => this.plan.set(p.days.some((d) => d.meals.length) ? p.days : []),
        () => {},
      );
    }
    const all = await this.api.get<RecipeSummary[]>('recipes');
    this.total.set(all.length);
    this.recent.set(
      [...all].sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? '')).slice(0, 6),
    );
    this.loadMeals();
  }

  private async loadMeals(): Promise<void> {
    if (this.session.has('meallog')) {
      this.meals.set((await this.api.get<MealLog>('meallog', { days: 14 })).entries.slice(0, 5));
    }
  }

  search(): void {
    this.router.navigate(['/ricette'], { queryParams: { q: this.q || null } });
  }

  /** "I ate it": log tonight's dish in the diary with one click. */
  async ate(o: PlanOption, meal: string): Promise<void> {
    try {
      await this.api.post('meallog', {
        day: today(),
        meal,
        recipe: o.recipe ?? '',
        text: o.recipe ? '' : o.text,
        servings: o.servings,
      });
      this.notify.ok('diary.logged');
      this.loadMeals();
    } catch (e) {
      this.notify.error(e);
    }
  }
}
