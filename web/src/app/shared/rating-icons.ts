import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';
import { RatingKey } from '../core/models';

const STAR = 'M12 2.8l2.9 6 6.5.9-4.7 4.6 1.1 6.5L12 17.7l-5.8 3.1 1.1-6.5L2.6 9.7l6.5-.9z';
const TRIANGLE = 'M12 3.6 21.4 20H2.6z';

/**
 * Five stars (taste) or five triangles (ease), filled in whole and half steps for a value from 0 to 5. Own opinions are
 * drawn in colour (yellow stars, basil triangles, both with a dark outline so they show on any theme); a household's
 * average is grey and smaller. The shape tells the criterion, so colour is never the only clue.
 */
@Component({
  selector: 'app-rating-icons',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @for (f of fills(); track $index) {
      <span class="ri" [style.width.px]="size()" [style.height.px]="size()" [style.margin-inline.px]="pad()" aria-hidden="true">
        <svg viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()"><path [attr.d]="path()" class="ri-line" /></svg>
        @if (f > 0) {
          <svg viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()" class="ri-fill-wrap" [style.clip-path]="'inset(0 ' + (1 - f) * 100 + '% 0 0)'">
            <path [attr.d]="path()" class="ri-fill" />
          </svg>
        }
      </span>
    }
  `,
  host: { '[class]': '"ri-row ri-" + kind() + " ri-" + tone()' },
})
export class RatingIcons {
  readonly kind = input.required<RatingKey>();
  readonly value = input<number | null>(null);
  readonly tone = input<'mine' | 'family'>('mine');
  readonly size = input(24);
  /** One icon, fully filled, as a label for an average ("★ 4.5"). */
  readonly single = input(false);
  /** Space on each side of an icon (px), so a row of them has even, easier cells to tap. */
  readonly pad = input(0);
  protected path = computed(() => (this.kind() === 'taste' ? STAR : TRIANGLE));
  /** The fill of each of the five icons: 0, 0.5 or 1. */
  protected fills = computed(() => {
    if (this.single()) return [1];
    const v = this.value() ?? 0;
    return [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, (v - i) >= 1 ? 1 : v - i >= 0.5 ? 0.5 : 0)));
  });
}
