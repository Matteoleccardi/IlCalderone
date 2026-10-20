import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TPipe } from '../core/i18n';
import { FACET_ORDER, Facets, QUICK_MINUTES, facetValues } from '../core/facets';

/** A recipe's classification as small chips; each one opens the recipe list filtered by it. */
@Component({
  selector: 'app-facet-chips',
  imports: [RouterLink, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (chips().length || quick()) {
      <p class="facet-list">
        @for (c of chips(); track c.name + c.value) {
          <a class="facet-chip" [class.main]="c.name === 'course' || c.name === 'diet'" [routerLink]="['/ricette']"
            [queryParams]="c.params" [title]="'facet.' + c.name | t">{{ 'facet.' + c.name + '.' + c.value | t }}</a>
        }
        @if (quick()) {
          <a class="facet-chip" [routerLink]="['/ricette']" [queryParams]="{ quick: 1 }">⚡ {{ 'facet.quick' | t }}</a>
        }
      </p>
    }
  `,
})
export class FacetChips {
  readonly facets = input<Facets | null | undefined>(null);
  readonly time = input<number | null | undefined>(null);
  protected chips = computed(() =>
    FACET_ORDER.flatMap((name) =>
      facetValues(this.facets(), name).map((value) => ({ name, value, params: { [name]: value } })),
    ),
  );
  protected quick = computed(() => !!this.time() && this.time()! <= QUICK_MINUTES);
}
