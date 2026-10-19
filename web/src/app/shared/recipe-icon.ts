import { Component, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { Api } from '../core/api';

/** A recipe's 8-bit icon in a line of text (menus, plan, "tonight"); renders nothing when the recipe has none. */
@Component({
  selector: 'app-recipe-icon',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `@if (show()) {
    <img class="recipe-icon inline" [src]="api.iconUrl(id(), version() ?? undefined)" alt="" loading="lazy" />
  }`,
})
export class RecipeIcon {
  readonly id = input.required<string>();
  readonly show = input<boolean | undefined>(false);
  /** The recipe's "updated" stamp, so a changed icon is not served from the cache. */
  readonly version = input<string | null | undefined>(null);
  protected api = inject(Api);
}
