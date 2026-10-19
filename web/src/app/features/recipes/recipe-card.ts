import { Component, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { TPipe } from '../../core/i18n';
import { RecipeSummary } from '../../core/models';
import { VisibilityBadge } from '../../shared/visibility-badge';

@Component({
  selector: 'app-recipe-card',
  imports: [RouterLink, VisibilityBadge, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <a class="recipe-card" [routerLink]="['/ricette', recipe().id]">
      @if (recipe().photo) {
        <img [src]="api.photoUrl(recipe().id, recipe().updated)" alt="" loading="lazy" />
      } @else {
        <div class="nophoto" aria-hidden="true">🍲</div>
      }
      <div class="body">
        <strong>{{ recipe().title }}</strong>
        <span class="meta">
          @if (recipe().time_minutes) {
            <span>⏱ {{ 'recipe.minutes' | t: { n: recipe().time_minutes } }}</span>
          }
          <span [title]="'recipe.servings_title' | t">👥 {{ recipe().servings }}</span>
          @if (recipe().parents.length) {
            <span [title]="'recipe.is_variant' | t">⑂ {{ 'kind.variant' | t }}</span>
          }
          <app-visibility [value]="recipe().visibility" />
        </span>
      </div>
    </a>
  `,
})
export class RecipeCard {
  readonly recipe = input.required<RecipeSummary>();
  protected api = inject(Api);
}
