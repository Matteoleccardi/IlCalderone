import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, TPipe } from '../../core/i18n';
import { PlanDay } from '../../core/models';

/** Days of a plan with every option of every active menu (several menus on the same meal = several options). */
@Component({
  selector: 'app-week-plan',
  imports: [RouterLink, TPipe],
  template: `
    <div class="plan">
      @for (d of days(); track d.date) {
        <div class="plan-day" [class.today]="d.date === today()">
          <h3>{{ i18n.date(d.date, { weekday: 'long', day: 'numeric', month: 'short' }) }}</h3>
          @for (m of d.meals; track m.meal) {
            <div class="plan-meal">
              <span class="meal">{{ 'meal.' + m.meal | t }}</span>
              <ul class="plain">
                @for (o of m.options; track $index) {
                  <li>
                    @if (o.recipe && o.available) { <a [routerLink]="['/ricette', o.recipe]">{{ o.title }}</a> }
                    @else if (o.recipe) { <span class="muted">{{ 'common.unavailable_recipe' | t }}</span> }
                    @else { {{ o.text }} }
                    @if (m.options.length > 1 || showMenu()) {
                      <a class="badge" [routerLink]="['/menu', o.menu]">{{ o.space === 'me' ? ('space.me' | t) : o.space_name }} · {{ o.menu_name }}</a>
                    }
                  </li>
                }
              </ul>
            </div>
          } @empty {
            <p class="muted small">—</p>
          }
        </div>
      }
    </div>
  `,
})
export class WeekPlan {
  readonly days = input.required<PlanDay[]>();
  readonly today = input<string>('');
  readonly showMenu = input(false);
  protected i18n = inject(I18n);
}
