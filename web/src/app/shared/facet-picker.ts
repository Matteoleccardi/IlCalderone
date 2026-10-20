import { Component, computed, inject, input, model, ChangeDetectionStrategy } from '@angular/core';
import { TPipe } from '../core/i18n';
import { FACET_ORDER, FacetDefs, Facets, facetValues } from '../core/facets';

/**
 * Tap-to-pick chips for the recipe classification.
 * mode "edit" (recipe form): single facets take one value, "base" at most its max, required facets are marked.
 * mode "filter" (recipe list): any number of values per facet, nothing required.
 */
@Component({
  selector: 'app-facet-picker',
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @for (name of names(); track name) {
      @let d = defs()[name];
      <fieldset class="facet">
        <legend>
          {{ 'facet.' + name | t }}
          @if (mode() === 'edit' && d.required) {
            <span class="req" [title]="'facet.required' | t">*</span>
          }
          @if (mode() === 'edit' && d.multi && d.max) {
            <span class="muted small">{{ 'facet.max' | t: { n: d.max } }}</span>
          }
        </legend>
        <div class="facet-chips">
          @for (v of d.values; track v) {
            @let on = has(name, v);
            <button
              type="button"
              class="chip-btn"
              [class.on]="on"
              [attr.aria-pressed]="on"
              [disabled]="!on && full(name)"
              (click)="toggle(name, v)"
            >
              {{ 'facet.' + name + '.' + v | t }}
            </button>
          }
        </div>
      </fieldset>
    }
  `,
})
export class FacetPicker {
  readonly defs = input.required<FacetDefs>();
  readonly value = model.required<Facets>();
  readonly mode = input<'edit' | 'filter'>('edit');
  /** Show only these facets (default: all). */
  readonly only = input<string[] | null>(null);

  protected names = computed(() => {
    const only = this.only();
    return FACET_ORDER.filter((n) => this.defs()[n] && (!only || only.includes(n)));
  });

  protected has(name: string, v: string): boolean {
    return facetValues(this.value(), name).includes(v);
  }

  /** A multi facet with a maximum that is reached (editor only). */
  protected full(name: string): boolean {
    const d = this.defs()[name];
    return this.mode() === 'edit' && d.multi && !!d.max && facetValues(this.value(), name).length >= d.max;
  }

  protected toggle(name: string, v: string): void {
    const d = this.defs()[name];
    const cur = facetValues(this.value(), name);
    const multi = d.multi || this.mode() === 'filter';
    let next: string | string[] | null;
    if (multi) {
      const set = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
      next = d.values.filter((x) => set.includes(x)); // keep the official order
    } else {
      next = cur.includes(v) ? null : v; // tap again to clear
    }
    this.value.set({ ...this.value(), [name]: next });
  }
}
