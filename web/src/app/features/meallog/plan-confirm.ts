import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Api } from '../../core/api';
import { I18n, TPipe } from '../../core/i18n';
import { MealEntry, PlanDay, PlanOption } from '../../core/models';
import { Notify } from '../../core/notify';
import { RecipeIcon } from '../../shared/recipe-icon';
import { addDays, today } from './dates';

interface Row {
  key: string;
  meal: string;
  option: PlanOption;
  menus: string[];
  logged: boolean;
}

/**
 * "From the menu": confirm in one tap that you ate what was planned today, or yesterday (if you forgot in the
 * evening). Every planned dish has a tick box; dishes already in the diary are shown as done.
 */
@Component({
  selector: 'app-plan-confirm',
  imports: [RecipeIcon, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="card plan-confirm">
      <div class="page-head">
        <h2>{{ 'diary.from_plan' | t }}</h2>
        <div class="segmented" role="group" [attr.aria-label]="'diary.day' | t">
          <button type="button" [class.on]="day() === yesterday" [attr.aria-pressed]="day() === yesterday" (click)="day.set(yesterday)">
            {{ 'diary.yesterday' | t }}
          </button>
          <button type="button" [class.on]="day() === now" [attr.aria-pressed]="day() === now" (click)="day.set(now)">
            {{ 'diary.today' | t }}
          </button>
        </div>
      </div>
      <p class="muted small">{{ i18n.date(day()) }}</p>
      @if (rows().length) {
        <ul class="plain">
          @for (r of rows(); track r.key) {
            <li>
              <label class="check plan-row" [class.done]="r.logged">
                <input
                  type="checkbox"
                  [checked]="r.logged || picked().has(r.key)"
                  [disabled]="r.logged"
                  (change)="toggle(r.key)"
                />
                <span class="meal">{{ 'meal.' + r.meal | t }}</span>
                <app-recipe-icon [id]="r.option.recipe ?? ''" [show]="!!r.option.recipe && r.option.icon" [version]="r.option.updated" />
                <span class="dish">{{ r.option.recipe ? (r.option.title ?? ('common.unavailable_recipe' | t)) : r.option.text }}</span>
                @if (r.logged) {
                  <span class="badge">✓ {{ 'diary.already' | t }}</span>
                } @else if (several()) {
                  <span class="muted small">{{ r.menus.join(', ') }}</span>
                }
              </label>
            </li>
          }
        </ul>
        @if (todo() > 0) {
          <button type="button" class="primary" (click)="save()" [disabled]="busy() || !picked().size">
            <span aria-hidden="true">🍽</span> {{ 'diary.confirm' | t: { n: picked().size } }}
          </button>
        } @else {
          <p class="ok small">{{ 'diary.all_done' | t }}</p>
        }
      } @else if (loaded()) {
        <p class="muted">{{ 'diary.plan_none' | t }}</p>
      }
    </section>
  `,
})
export class PlanConfirm {
  /** Your own diary entries (to show what is already logged). */
  readonly entries = input.required<MealEntry[]>();
  readonly saved = output<void>();

  protected i18n = inject(I18n);
  private api = inject(Api);
  private notify = inject(Notify);

  protected now = today();
  protected yesterday = addDays(this.now, -1);
  // in the morning you are more likely confirming last night's dinner
  protected day = signal(new Date().getHours() < 12 ? this.yesterday : this.now);
  private plan = signal<PlanDay | null>(null);
  protected loaded = signal(false);
  protected busy = signal(false);
  protected picked = signal<Set<string>>(new Set());

  protected rows = computed<Row[]>(() => {
    const p = this.plan();
    if (!p) return [];
    const mine = this.entries().filter((e) => e.day === p.date);
    const rows: Row[] = [];
    for (const m of p.meals) {
      for (const o of m.options.filter((x) => !x.recipe || x.available)) {
        // the same dish planned by two menus is one row (its menus listed together)
        const key = `${m.meal}|${o.recipe ?? 'text:' + o.text.toLowerCase()}`;
        const same = rows.find((r) => r.key === key);
        if (same) {
          if (!same.menus.includes(o.menu_name)) same.menus.push(o.menu_name);
          continue;
        }
        rows.push({
          key,
          meal: m.meal,
          option: o,
          menus: [o.menu_name],
          logged: mine.some((e) => e.meal === m.meal && (o.recipe ? e.recipe === o.recipe : !e.recipe && e.title === o.text)),
        });
      }
    }
    return rows;
  });
  /** Several menus on the same meal: show which menu each option comes from. */
  protected several = computed(() => {
    const meals = this.rows().map((r) => r.meal);
    return meals.length !== new Set(meals).size;
  });
  protected todo = computed(() => this.rows().filter((r) => !r.logged).length);

  constructor() {
    effect(() => {
      this.load(this.day());
    });
    // tick by default the first dish of each meal that has nothing in the diary yet
    effect(() => {
      const rows = this.rows();
      const done = new Set(rows.filter((r) => r.logged).map((r) => r.meal));
      const pick = new Set<string>();
      for (const r of rows) {
        if (!r.logged && !done.has(r.meal)) {
          pick.add(r.key);
          done.add(r.meal);
        }
      }
      this.picked.set(pick);
    });
  }

  private async load(day: string): Promise<void> {
    this.loaded.set(false);
    try {
      const res = await this.api.get<{ days: PlanDay[] }>('menus/plan', { from: day, days: 1 });
      this.plan.set(res.days[0] ?? null);
    } catch (e) {
      this.plan.set(null);
      this.notify.error(e);
    } finally {
      this.loaded.set(true);
    }
  }

  protected toggle(key: string): void {
    this.picked.update((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  async save(): Promise<void> {
    const rows = this.rows().filter((r) => this.picked().has(r.key) && !r.logged);
    if (!rows.length) return;
    this.busy.set(true);
    let n = 0;
    try {
      for (const r of rows) {
        await this.api.post('meallog', {
          day: this.day(),
          meal: r.meal,
          recipe: r.option.recipe ?? '',
          text: r.option.recipe ? '' : r.option.text,
          servings: r.option.servings,
        });
        n++;
      }
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.busy.set(false);
      if (n) {
        this.notify.ok('diary.confirmed', { n });
        this.saved.emit();
      }
    }
  }
}
