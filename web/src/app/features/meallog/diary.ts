import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { I18n, TPipe } from '../../core/i18n';
import { MEALS, MealEntry, MealLog, RecipeSummary } from '../../core/models';
import { Notify } from '../../core/notify';
import { SessionService } from '../../core/session';
import { today } from './dates';
import { PlanConfirm } from './plan-confirm';

/** The meal diary. You write your own; you can read the diaries of the people in your households. */
@Component({
  selector: 'app-diary',
  imports: [FormsModule, RouterLink, PlanConfirm, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="page-head">
      <h1>{{ 'diary.title' | t }}</h1>
      @if ((log()?.people?.length ?? 0) > 1) {
        <label class="inline"
          >{{ 'diary.whose' | t }}
          <select [ngModel]="who()" (ngModelChange)="setWho($event)" name="who">
            @for (p of log()!.people; track p.id) {
              <option [value]="p.id">
                {{ p.id === me() ? ('diary.me' | t) : (p.name ?? ('common.deleted_user' | t)) }}
              </option>
            }
            <option value="all">{{ 'diary.everyone' | t }}</option>
          </select>
        </label>
      }
    </div>
    @if ((who() === me() || who() === 'all') && session.has('menus')) {
      <app-plan-confirm [entries]="mine()" (saved)="reload()" />
    }
    @if (who() === me() || who() === 'all') {
      <section class="card">
        <h2>{{ 'diary.add' | t }}</h2>
        <form class="diary-form" (ngSubmit)="add()">
          <div class="row">
            <label
              >{{ 'diary.day' | t }} <input type="date" name="day" [(ngModel)]="day" required
            /></label>
            <label
              >{{ 'diary.meal' | t }}
              <select name="meal" [(ngModel)]="meal">
                @for (m of meals; track m) {
                  <option [value]="m">{{ 'meal.' + m | t }}</option>
                }
              </select>
            </label>
            <label
              >{{ 'diary.servings' | t }}
              <input type="number" name="servings" min="0.5" step="0.5" [(ngModel)]="servings"
            /></label>
          </div>
          <div class="row">
            <label
              >{{ 'diary.recipe' | t }}
              <select name="recipe" [(ngModel)]="recipe">
                <option value="">{{ 'diary.other' | t }}</option>
                @for (r of recipes(); track r.id) {
                  <option [value]="r.id">{{ r.title }}</option>
                }
              </select>
            </label>
            @if (!recipe) {
              <label
                >{{ 'diary.what' | t }}
                <input name="text" [(ngModel)]="text" [placeholder]="'diary.what_placeholder' | t"
              /></label>
            }
          </div>
          <label
            >{{ 'form.note' | t }}
            <input name="note" [(ngModel)]="note" [placeholder]="'common.optional' | t"
          /></label>
          <button type="submit" class="primary">{{ 'common.add' | t }}</button>
        </form>
      </section>
    }

    <div class="diary">
      <section>
        <div class="page-head">
          <h2>{{ 'diary.recent_days' | t }}</h2>
          <select
            [ngModel]="days()"
            (ngModelChange)="setDays($event)"
            [attr.aria-label]="'diary.period' | t"
          >
            <option [ngValue]="7">{{ 'diary.days' | t: { n: 7 } }}</option>
            <option [ngValue]="30">{{ 'diary.days' | t: { n: 30 } }}</option>
            <option [ngValue]="90">{{ 'diary.days' | t: { n: 90 } }}</option>
            <option [ngValue]="365">{{ 'diary.year' | t }}</option>
          </select>
        </div>
        @for (g of groups(); track g.day) {
          <h3 class="day">{{ i18n.date(g.day) }}</h3>
          <ul class="plain">
            @for (e of g.entries; track e.id) {
              <li class="entry">
                <span class="meal">{{ 'meal.' + e.meal | t }}</span>
                @if (e.recipe && e.recipe_available) {
                  <a [routerLink]="['/ricette', e.recipe]">{{ e.title }}</a>
                } @else {
                  <span>{{ e.title }}</span>
                }
                @if (e.servings) {
                  <span class="muted small">× {{ i18n.number(e.servings) }}</span>
                }
                @if (e.note) {
                  <span class="muted small">— {{ e.note }}</span>
                }
                @if (who() === 'all') {
                  <span class="badge">{{ e.user_name ?? ('common.deleted_user' | t) }}</span>
                }
                @if (e.mine) {
                  <button
                    type="button"
                    class="link"
                    (click)="remove(e)"
                    [attr.aria-label]="'common.delete_named' | t: { name: e.title }"
                  >
                    ✕
                  </button>
                }
              </li>
            }
          </ul>
        } @empty {
          <p class="muted">{{ 'diary.nothing' | t }}</p>
        }
      </section>
      <aside class="card">
        <h2>{{ 'diary.top' | t }}</h2>
        <p class="muted small">{{ 'diary.top_period' | t }}</p>
        <ol>
          @for (t of log()?.top ?? []; track t.recipe) {
            <li>
              <a [routerLink]="['/ricette', t.recipe]">{{ t.title }}</a>
              <span class="muted small">× {{ t.count }}</span>
            </li>
          } @empty {
            <li class="muted">—</li>
          }
        </ol>
      </aside>
    </div>
  `,
})
export class Diary implements OnInit {
  protected i18n = inject(I18n);
  private api = inject(Api);
  private notify = inject(Notify);
  protected session = inject(SessionService);
  protected meals = [...MEALS].sort((a, b) => (a === 'cena' ? -1 : b === 'cena' ? 1 : 0));
  protected log = signal<MealLog | null>(null);
  protected recipes = signal<RecipeSummary[]>([]);
  protected days = signal(30);
  protected me = computed(() => this.session.user()?.id ?? '');
  protected who = signal<string>(this.session.user()?.id ?? '');
  protected day = today();
  protected meal = 'cena';
  protected recipe = '';
  protected text = '';
  protected servings: number | null = null;
  protected note = '';

  /** Your own entries (the plan card marks what is already logged). */
  protected mine = computed(() => (this.log()?.entries ?? []).filter((e) => e.mine ?? e.user === this.me()));

  protected groups = computed(() => {
    const out: { day: string; entries: MealEntry[] }[] = [];
    for (const e of this.log()?.entries ?? []) {
      if (out.at(-1)?.day !== e.day) out.push({ day: e.day, entries: [] });
      out.at(-1)!.entries.push(e);
    }
    return out;
  });

  async ngOnInit(): Promise<void> {
    this.api.get<RecipeSummary[]>('recipes').then((r) => this.recipes.set(r));
    await this.reload();
  }

  async reload(): Promise<void> {
    try {
      this.log.set(await this.api.get<MealLog>('meallog', { days: this.days(), user: this.who() }));
    } catch (e) {
      this.notify.error(e);
    }
  }

  setDays(d: number): void {
    this.days.set(d);
    this.reload();
  }

  setWho(id: string): void {
    this.who.set(id);
    this.reload();
  }

  async add(): Promise<void> {
    try {
      await this.api.post('meallog', {
        day: this.day,
        meal: this.meal,
        recipe: this.recipe,
        text: this.text,
        servings: this.servings,
        note: this.note,
      });
      this.text = this.note = '';
      this.recipe = '';
      this.servings = null;
      this.notify.ok('diary.added');
      await this.reload();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async remove(e: MealEntry): Promise<void> {
    try {
      await this.api.delete(`meallog/${e.id}`);
      await this.reload();
    } catch (err) {
      this.notify.error(err);
    }
  }
}
