import { Component, computed, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { FEATURES } from '../../core/features';
import { SessionService } from '../../core/session';
import { TPipe } from '../../core/i18n';
import { RecipeSummary } from '../../core/models';
import { NavIcon } from '../../shared/nav-icon';
import { VisibilityBadge } from '../../shared/visibility-badge';

@Component({
  selector: 'app-recipe-card',
  imports: [NavIcon, NgComponentOutlet, RouterLink, VisibilityBadge, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="recipe-card-wrap">
    <a class="recipe-card" [routerLink]="['/ricette', recipe().id]">
      <!-- the hand-drawn icon is shown at a whole number of art-pixels (160px = 5px each), never stretched -->
      @if (recipe().icon) {
        <img class="card-pic recipe-icon" [src]="api.iconUrl(recipe().id, recipe().updated)" alt="" loading="lazy" />
      } @else if (recipe().photo) {
        <img class="card-pic photo" [src]="api.photoUrl(recipe().id, recipe().updated)" alt="" loading="lazy" />
      } @else {
        <div class="card-pic nopic" aria-hidden="true"><app-nav-icon name="/ricette" /></div>
      }
      <div class="body">
        <strong>{{ recipe().title }}</strong>
        <span class="meta">
          @if (recipe().time_minutes) { <span>{{ 'recipe.minutes' | t: { n: recipe().time_minutes } }}</span> }
          @if (diet(); as d) { <span>{{ d | t }}</span> }
          @if (recipe().parents.length) { <span>{{ 'kind.variant' | t }}</span> }
          <app-visibility [value]="recipe().visibility" />
        </span>
      </div>
    </a>
    @if (actions().length) {
      <div class="card-actions">
        @for (a of actions(); track $index) {
          <ng-container *ngComponentOutlet="a; inputs: { recipe: recipe(), compact: true }" />
        }
      </div>
    }
    </div>
  `,
})
export class RecipeCard {
  readonly recipe = input.required<RecipeSummary>();
  protected api = inject(Api);
  /** The diet as a translation key (one value, e.g. "vegan"), when the recipe has one. */
  protected diet = computed(() => {
    const d = this.recipe().facets['diet'];
    return typeof d === 'string' && d ? `facet.diet.${d}` : null;
  });
  private features = inject(FEATURES);
  private session = inject(SessionService);
  /** Buttons contributed by the enabled features (e.g. "Add to menu"). */
  protected actions = computed(() =>
    this.features
      .filter((f) => !f.module || this.session.has(f.module))
      .flatMap((f) => f.recipeActions ?? []),
  );
}
