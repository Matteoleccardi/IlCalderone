import { Component, ElementRef, computed, effect, inject, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { Api } from '../../core/api';
import { RecipeActionComponent, RecipeRef } from '../../core/features';
import { I18n, TPipe } from '../../core/i18n';
import { HouseholdRating, Rating, RatingKey, RecipeRating } from '../../core/models';
import { Notify } from '../../core/notify';
import { RatingsService, nextRating, stepRating } from '../../core/ratings';
import { RatingIcons } from '../../shared/rating-icons';

const NONE: Rating = { taste: null, ease: null };

/**
 * Ratings of a recipe. On the recipe page: my two opinions (taste: stars, ease: triangles) as tappable rows, and below them
 * the average of each of my households among the members who voted. On a card (compact): one line with a small icon and
 * number per criterion, mine in colour if I voted, else my household's average in grey.
 */
@Component({
  selector: 'app-recipe-rating',
  imports: [RatingIcons, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (compact()) {
      @if (badge().length) {
        <span class="rate-badge">
          @for (b of badge(); track b.key) {
            <span class="rate-badge-item" [class.ri-mine]="b.tone === 'mine'" [class.ri-family]="b.tone === 'family'"
              [attr.aria-label]="b.aria" role="img">
              <app-rating-icons [kind]="b.key" [single]="true" [tone]="b.tone" [size]="14" />
              <span class="rate-num" aria-hidden="true">{{ b.text }}</span>
            </span>
          }
        </span>
      }
    } @else if (ratings.enabled()) {
      <section class="rating" [attr.aria-label]="'rating.title' | t">
        <h2>{{ 'rating.mine_title' | t }}</h2>
        @for (c of criteria; track c.key) {
          <div class="rate-row">
            <span class="rate-label" [id]="'rl-' + c.key">{{ c.label | t }}</span>
            <div class="rate-input" role="slider" tabindex="0" [attr.aria-labelledby]="'rl-' + c.key"
              aria-valuemin="0" aria-valuemax="5" [attr.aria-valuenow]="mine()[c.key] ?? 0" [attr.aria-valuetext]="valueText(c.key)"
              (click)="tap($event, c.key)" (keydown)="key($event, c.key)">
              <app-rating-icons [kind]="c.key" [value]="mine()[c.key]" tone="mine" [size]="40" />
            </div>
            <span class="rate-value" aria-hidden="true">{{ mine()[c.key] === null ? '–' : num(mine()[c.key]!) }}</span>
          </div>
        }
        <p class="muted small">{{ 'rating.hint' | t }}</p>
        @for (h of families(); track h.id) {
          <div class="fam-row">
            <span class="fam-name">{{ h.name }}</span>
            @for (c of criteria; track c.key) {
              @if (h[c.key]; as a) {
                <span class="fam-item ri-family" role="img" [attr.aria-label]="famAria(h, c.key)">
                  <app-rating-icons [kind]="c.key" [single]="true" tone="family" [size]="16" />
                  <span aria-hidden="true">{{ num(a.avg) }} <span class="fam-n">({{ a.n }}/{{ h.members }})</span></span>
                </span>
              }
            }
          </div>
        }
      </section>
    }
  `,
})
export class RecipeRatingView implements RecipeActionComponent {
  readonly recipe = input.required<RecipeRef>();
  readonly compact = input(false);
  protected ratings = inject(RatingsService);
  private api = inject(Api);
  private i18n = inject(I18n);
  private notify = inject(Notify);
  private el = inject<ElementRef<HTMLElement>>(ElementRef);

  protected criteria: { key: RatingKey; label: string }[] = [
    { key: 'taste', label: 'rating.taste' },
    { key: 'ease', label: 'rating.ease' },
  ];
  protected mine = signal<Rating>(NONE);
  protected families = signal<HouseholdRating[]>([]);

  /** One entry per criterion that has something to show on a card. */
  protected badge = computed(() => {
    const row = this.ratings.rows()[this.recipe().id];
    if (!row) return [];
    return this.criteria.flatMap((c) => {
      const own = row.mine[c.key];
      const fam = row.family[c.key];
      const v = own ?? fam?.avg ?? null;
      if (v === null) return [];
      const tone = own !== null ? ('mine' as const) : ('family' as const);
      return [{ key: c.key, tone, text: this.num(v), aria: `${this.i18n.t(c.label)}: ${this.num(v)}` }];
    });
  });

  constructor() {
    effect(() => {
      if (this.compact()) {
        this.ratings.ensure();
      } else if (this.ratings.enabled()) {
        this.load();
      }
    });
  }

  private async load(): Promise<void> {
    try {
      const r = await this.api.get<RecipeRating>(`recipes/${this.recipe().id}/rating`);
      this.mine.set(r.mine);
      this.families.set(r.households);
    } catch (e) {
      this.notify.error(e);
    }
  }

  protected num(v: number): string {
    const s = (Math.round(v * 10) / 10).toString();
    return this.i18n.lang === 'en' ? s : s.replace('.', ',');
  }

  protected valueText(k: RatingKey): string {
    const v = this.mine()[k];
    return v === null ? this.i18n.t('rating.none') : this.i18n.t('rating.of_five', { n: this.num(v) });
  }

  protected famAria(h: HouseholdRating, k: RatingKey): string {
    const a = h[k]!;
    return this.i18n.t('rating.family_aria', { name: h.name, what: this.i18n.t(k === 'taste' ? 'rating.taste' : 'rating.ease'), avg: this.num(a.avg), n: a.n, m: h.members });
  }

  /** A tap on the row: which of the five icons was hit. */
  protected tap(ev: MouseEvent, k: RatingKey): void {
    const box = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const idx = Math.min(5, Math.max(1, Math.floor(((ev.clientX - box.left) / box.width) * 5) + 1));
    this.save(k, nextRating(this.mine()[k], idx));
  }

  protected key(ev: KeyboardEvent, k: RatingKey): void {
    let v: number | null | undefined;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') v = stepRating(this.mine()[k], 1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') v = stepRating(this.mine()[k], -1);
    else if (ev.key === 'Delete' || ev.key === 'Backspace') v = null;
    if (v === undefined) return;
    ev.preventDefault();
    this.save(k, v);
  }

  private async save(k: RatingKey, value: number | null): Promise<void> {
    const before = this.mine();
    this.mine.set({ ...before, [k]: value });                  // shown at once
    try {
      const r = await this.api.put<RecipeRating>(`recipes/${this.recipe().id}/rating`, { [k]: value });
      this.mine.set(r.mine);
      this.families.set(r.households);
      this.ratings.refresh();
    } catch (e) {
      this.mine.set(before);
      this.notify.error(e);
    }
  }
}
