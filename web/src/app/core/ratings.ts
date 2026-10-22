import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';
import { RatingKey, RatingRow } from './models';
import { Notify } from './notify';
import { SessionService } from './session';

/** The ratings of the recipes in the list (mine, and my household's), loaded once and refreshed after a vote. */
@Injectable({ providedIn: 'root' })
export class RatingsService {
  private api = inject(Api);
  private session = inject(SessionService);
  private notify = inject(Notify);
  readonly enabled = computed(() => this.session.has('ratings'));
  readonly rows = signal<Record<string, RatingRow>>({});
  private loaded = false;

  /** Loads the summary the first time it is needed (a no-op when the module is off). */
  ensure(): void {
    if (this.loaded || !this.enabled()) return;
    this.loaded = true;
    this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      this.rows.set(await this.api.get<Record<string, RatingRow>>('ratings/summary'));
    } catch (e) {
      this.loaded = false;
      this.notify.error(e);
    }
  }

  /** The score of a recipe for sorting and filtering: my own opinion if I have one, else my household's average. */
  score(id: string, key: RatingKey): number | null {
    const r = this.rows()[id];
    return r?.mine[key] ?? r?.family[key]?.avg ?? null;
  }
}

/**
 * What a tap on icon k (1 to 5) does to the current value: set k; tap the same icon again for half a step less; once more
 * clears it. (Whole icons are the touch target, so halves need no tiny hit area.)
 */
export function nextRating(current: number | null, k: number): number | null {
  if (current === k) return k - 0.5;
  if (current === k - 0.5) return null;
  return k;
}

/** Keyboard step on the rating slider: +-0.5, below 0.5 = no opinion, never above 5. */
export function stepRating(current: number | null, dir: 1 | -1): number | null {
  const v = (current ?? 0) + dir * 0.5;
  return v < 0.5 ? null : Math.min(5, v);
}
