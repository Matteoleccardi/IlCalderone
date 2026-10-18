import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { I18n, TPipe } from '../../core/i18n';
import { MEALS, Meal, Menu, MenuSummary, PlanDay, Visibility } from '../../core/models';
import { Notify } from '../../core/notify';
import { ScopePicker } from '../../shared/scope-picker';
import { addDays, today } from '../meallog/dates';
import { WeekPlan } from './week-plan';

/** The plan of the coming days over all your menus, the list of menus, and "new menu". */
@Component({
  selector: 'app-menu-list',
  imports: [FormsModule, RouterLink, ScopePicker, WeekPlan, TPipe],
  template: `
    <h1>{{ 'nav.menus' | t }}</h1>
    <section>
      <div class="page-head">
        <h2>{{ 'menus.plan' | t }}</h2>
        <div class="actions">
          <button type="button" (click)="shift(-7)" [attr.aria-label]="'common.previous' | t">←</button>
          <button type="button" (click)="from.set(start); loadPlan()">{{ 'menus.from_today' | t }}</button>
          <button type="button" (click)="shift(7)" [attr.aria-label]="'common.next' | t">→</button>
        </div>
      </div>
      @if (plan().length && hasAny()) {
        <app-week-plan [days]="plan()" [today]="start" [showMenu]="menus().length > 1" />
      } @else {
        <p class="muted">{{ 'menus.nothing_planned' | t }}</p>
      }
    </section>

    <section>
      <h2>{{ 'menus.list' | t }}</h2>
      @if (menus().length) {
        <ul class="cards">
          @for (m of menus(); track m.id) {
            <li class="card">
              <a [routerLink]="['/menu', m.id]"><strong>{{ m.name }}</strong></a>
              <span class="badge">{{ m.visibility === 'household' ? m.household_name : ('space.me' | t) }}</span>
              @if (!m.active) { <span class="badge off">{{ 'menus.off' | t }}</span> }
              @else if (!m.in_season) { <span class="badge off">{{ 'menus.out_of_season' | t }}</span> }
              <p class="small muted">
                {{ 'menus.weeks' | t: { n: m.weeks } }} · {{ mealNames(m.meals) }}
                @if (m.season) { · {{ season(m) }} }
                @if (m.active && m.in_season) { · {{ 'menus.today_is' | t: { week: m.today.week } }} }
              </p>
              @if (m.notes) { <p class="small">{{ m.notes }}</p> }
            </li>
          }
        </ul>
      } @else {
        <p class="muted">{{ 'menus.none' | t }}</p>
      }
    </section>

    <section class="card narrow">
      <h2>{{ 'menus.new' | t }}</h2>
      <form (ngSubmit)="create()">
        <label>{{ 'common.name' | t }} <input name="name" [(ngModel)]="name" required maxlength="120" [placeholder]="'menus.name_placeholder' | t" /></label>
        <app-scope-picker [(visibility)]="visibility" [(household)]="household" [allowShared]="false" />
        <div class="row">
          <label>{{ 'menus.weeks_label' | t }} <input name="weeks" type="number" min="1" max="12" [(ngModel)]="weeks" /></label>
          <label>{{ 'menus.start' | t }} <input name="start" type="date" [(ngModel)]="startDay" /></label>
        </div>
        <fieldset class="meals-pick">
          <legend>{{ 'menus.meals' | t }}</legend>
          @for (m of allMeals; track m) {
            <label class="check"><input type="checkbox" [name]="'meal-' + m" [checked]="meals.includes(m)" (change)="toggleMeal(m)" /> {{ 'meal.' + m | t }}</label>
          }
        </fieldset>
        <button type="submit" class="primary">{{ 'common.create' | t }}</button>
      </form>
    </section>
  `,
})
export class MenuList implements OnInit {
  protected i18n = inject(I18n);
  private api = inject(Api);
  private notify = inject(Notify);
  private router = inject(Router);
  protected start = today();
  protected from = signal(today());
  protected plan = signal<PlanDay[]>([]);
  protected menus = signal<MenuSummary[]>([]);
  protected allMeals = MEALS;
  protected name = '';
  protected weeks = 4;
  protected startDay = today();
  protected meals: Meal[] = ['cena'];
  protected visibility = signal<Visibility>('private');
  protected household = signal<string | null>(null);

  protected hasAny = () => this.plan().some((d) => d.meals.length);

  async ngOnInit(): Promise<void> {
    this.loadPlan();
    try {
      this.menus.set(await this.api.get<MenuSummary[]>('menus'));
    } catch (e) {
      this.notify.error(e);
    }
  }

  async loadPlan(): Promise<void> {
    try {
      this.plan.set((await this.api.get<{ days: PlanDay[] }>('menus/plan', { from: this.from(), days: 7 })).days);
    } catch (e) {
      this.notify.error(e);
    }
  }

  shift(n: number): void {
    this.from.update((f) => addDays(f, n));
    this.loadPlan();
  }

  mealNames(meals: string[]): string {
    return meals.map((m) => this.i18n.t('meal.' + m)).join(', ');
  }

  season(m: MenuSummary): string {
    const months = this.i18n.months();
    const [from, to] = [m.season!.from, m.season!.to].map((s) => months[Number(s.slice(0, 2)) - 1]);
    return this.i18n.t('menus.season_range', { from, to });
  }

  toggleMeal(m: Meal): void {
    this.meals = this.meals.includes(m) ? this.meals.filter((x) => x !== m) : [...this.meals, m];
  }

  async create(): Promise<void> {
    try {
      const m = await this.api.post<Menu>('menus', {
        name: this.name, visibility: this.visibility(), household: this.household(), weeks: this.weeks, start: this.startDay,
        meals: this.meals,
      });
      this.router.navigate(['/menu', m.id]);
    } catch (e) {
      this.notify.error(e);
    }
  }
}
