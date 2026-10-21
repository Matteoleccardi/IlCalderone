import { Component, computed, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { FEATURES } from '../../core/features';
import { SessionService } from '../../core/session';
import { TPipe } from '../../core/i18n';
import { RecipeSummary } from '../../core/models';
import { VisibilityBadge } from '../../shared/visibility-badge';

@Component({
  selector: 'app-recipe-card',
  imports: [NgComponentOutlet, RouterLink, VisibilityBadge, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="recipe-card-wrap">
    <a class="recipe-card" [routerLink]="['/ricette', recipe().id]">
      @if (recipe().photo) {
        <img [src]="api.photoUrl(recipe().id, recipe().updated)" alt="" loading="lazy" />
      } @else if (recipe().icon) {
        <div class="nophoto" aria-hidden="true">
          <img class="recipe-icon big" [src]="api.iconUrl(recipe().id, recipe().updated)" alt="" loading="lazy" />
        </div>
      } @else {
        <div class="nophoto" aria-hidden="true">🍲</div>
      }
      <div class="body">
        <strong class="with-icon">
          @if (recipe().icon && recipe().photo) {
            <img class="recipe-icon" [src]="api.iconUrl(recipe().id, recipe().updated)" alt="" loading="lazy" />
          }
          {{ recipe().title }}
        </strong>
        <span class="meta">
          @if (recipe().time_minutes) {
            <span><span aria-hidden="true">⏱</span> {{ 'recipe.minutes' | t: { n: recipe().time_minutes } }}</span>
          }
          <span [title]="'recipe.servings_title' | t"><span aria-hidden="true">👥</span> {{ recipe().servings }}<span class="sr-only"> {{ 'recipe.servings_title' | t }}</span></span>
          @if (recipe().parents.length) {
            <span [title]="'recipe.is_variant' | t"><span aria-hidden="true">⑂</span> {{ 'kind.variant' | t }}</span>
          }
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
  private features = inject(FEATURES);
  private session = inject(SessionService);
  /** Buttons contributed by the enabled features (e.g. "Add to menu"). */
  protected actions = computed(() =>
    this.features
      .filter((f) => !f.module || this.session.has(f.module))
      .flatMap((f) => f.recipeActions ?? []),
  );
}
