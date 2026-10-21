import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { I18n, TPipe } from '../../core/i18n';
import { FacetChips } from '../../shared/facet-chips';
import { Ingredient, Recipe, Revision } from '../../core/models';
import { Notify } from '../../core/notify';
import { fmtQty } from '../../core/text-formats';
import { AppTitle } from '../../core/title';

/** A line of an old version, marked when it differs from the version before it. */
interface Line {
  text: string;
  mark: '' | 'added' | 'removed';
}

/**
 * History of a recipe's in-place edits (/ricette/:id/cronologia): who changed what and when, any old version
 * with the lines it added/removed, and "restore" (which saves the old content as a new version).
 */
@Component({
  selector: 'app-recipe-history',
  imports: [FacetChips, RouterLink, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (recipe(); as r) {
      <p>
        <a [routerLink]="['/ricette', r.id]"><span aria-hidden="true">←</span> {{ r.title }}</a>
      </p>
      <h1>{{ 'history.title' | t }}</h1>
      <p class="muted">{{ 'history.intro' | t }}</p>
      <div class="table-wrap" tabindex="0" role="region" [attr.aria-label]="'history.title' | t">
      <table class="table history">
        <thead>
          <tr>
            <th>{{ 'history.version' | t }}</th>
            <th>{{ 'history.when' | t }}</th>
            <th>{{ 'history.who' | t }}</th>
            <th>{{ 'history.what' | t }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (v of versions(); track v.rev) {
            <tr [class.selected]="v.rev === selected()">
              <td>
                {{ v.rev }}
                @if (v.current) {
                  <span class="badge">{{ 'history.current' | t }}</span>
                }
              </td>
              <td class="small">{{ i18n.dateTime(v.updated) }}</td>
              <td>{{ v.by_name ?? ('common.deleted_user' | t) }}</td>
              <td class="small">{{ v.first ? ('history.created' | t) : changes(v) }}</td>
              <td>
                <button type="button" class="link" (click)="show(v.rev)">
                  {{ 'history.show' | t }}
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      </div>

      @if (shown(); as s) {
        <section class="card version">
          <div class="page-head">
            <h2>{{ 'history.version_n' | t: { n: s.rev } }} — {{ s.title }}</h2>
            @if (r.can_edit && s.rev !== r.rev) {
              <button type="button" class="primary" (click)="restore(s.rev)">
                {{ 'history.restore' | t }}
              </button>
            }
          </div>
          <p class="muted small">
            {{ 'recipe.people' | t: { n: s.servings } }}
            @if (s.time_minutes) {
              · {{ 'recipe.minutes' | t: { n: s.time_minutes } }}
            }
            @if ($any(s).category) {
              · {{ $any(s).category }}
            }
          </p>
          <app-facet-chips [facets]="s.facets" />
          <h3>{{ 'recipe.ingredients' | t }}</h3>
          <ul class="plain diff">
            @for (l of ingredientLines(); track $index) {
              <li [class]="l.mark">{{ l.text }}</li>
            }
          </ul>
          <h3>{{ 'recipe.steps' | t }}</h3>
          <ul class="plain diff">
            @for (l of stepLines(); track $index) {
              <li [class]="l.mark">{{ l.text }}</li>
            }
          </ul>
          @if (s.notes) {
            <h3>{{ 'recipe.notes' | t }}</h3>
            <p class="pre">{{ s.notes }}</p>
          }
          @if (s.taken_from) {
            <p class="muted small">{{ 'recipe.taken_from' | t: { from: s.taken_from } }}</p>
          }
          @if (previous()) {
            <p class="muted small">{{ 'history.legend' | t }}</p>
          }
        </section>
      }
    } @else {
      <p class="muted">{{ 'common.loading' | t }}</p>
    }
  `,
})
export class RecipeHistory {
  readonly id = input.required<string>();
  protected i18n = inject(I18n);
  private api = inject(Api);
  private notify = inject(Notify);
  private router = inject(Router);
  private title = inject(AppTitle);
  protected recipe = signal<Recipe | null>(null);
  protected versions = signal<Revision[]>([]);
  protected selected = signal<number | null>(null);
  protected shown = signal<Recipe | null>(null);
  protected previous = signal<Recipe | null>(null);

  protected ingredientLines = computed(() =>
    this.diff(
      this.shown()?.ingredients.map((i) => this.ingredientText(i)) ?? [],
      this.previous()?.ingredients.map((i) => this.ingredientText(i)),
    ),
  );
  protected stepLines = computed(() =>
    this.diff(
      this.shown()?.steps.map((s, n) => `${n + 1}. ${s.title ? s.title + ': ' : ''}${s.text}`) ??
        [],
      this.previous()?.steps.map((s, n) => `${n + 1}. ${s.title ? s.title + ': ' : ''}${s.text}`),
    ),
  );

  constructor() {
    effect(() => {
      this.load(this.id());
    });
  }

  private async load(id: string): Promise<void> {
    try {
      const [r, h] = await Promise.all([
        this.api.get<Recipe>(`recipes/${id}`),
        this.api.get<Revision[]>(`recipes/${id}/history`),
      ]);
      this.recipe.set(r);
      this.versions.set(h);
      this.title.set(`${this.i18n.t('history.title')}: ${r.title}`);
      await this.show(r.rev);
    } catch (e) {
      this.notify.error(e);
      this.router.navigate(['/ricette', id]);
    }
  }

  protected changes(v: Revision): string {
    return v.changes.map((c) => this.i18n.t('field.' + c)).join(', ') || '—';
  }

  async show(rev: number): Promise<void> {
    const list = this.versions();
    const i = list.findIndex((v) => v.rev === rev);
    const prevRev = list[i + 1]?.rev; // the list is newest first
    try {
      const [s, p] = await Promise.all([
        this.api.get<Recipe>(`recipes/${this.id()}/history/${rev}`),
        prevRev
          ? this.api.get<Recipe>(`recipes/${this.id()}/history/${prevRev}`)
          : Promise.resolve(null),
      ]);
      this.selected.set(rev);
      this.shown.set(s);
      this.previous.set(p);
    } catch (e) {
      this.notify.error(e);
    }
  }

  async restore(rev: number): Promise<void> {
    if (!confirm(this.i18n.t('history.confirm_restore', { n: rev }))) return;
    try {
      await this.api.post<Recipe>(`recipes/${this.id()}/history/${rev}/restore`);
      this.notify.ok('history.restored', { n: rev });
      this.router.navigate(['/ricette', this.id()]);
    } catch (e) {
      this.notify.error(e);
    }
  }

  private ingredientText(i: Ingredient): string {
    const qty =
      i.qty === null ? this.i18n.t('qty.qb') : `${fmtQty(i.qty, this.i18n.lang)} ${i.unit}`;
    const extra = [i.optional ? this.i18n.t('recipe.optional') : '', i.note]
      .filter(Boolean)
      .join(', ');
    return `${i.name} — ${qty}${extra ? ` (${extra})` : ''}`;
  }

  /** Lines of this version; with the previous version, new lines are "added" and lines that disappeared are appended as "removed". */
  private diff(now: string[], before?: string[]): Line[] {
    if (!before) return now.map((text) => ({ text, mark: '' }));
    const old = new Set(before);
    const cur = new Set(now);
    return [
      ...now.map((text): Line => ({ text, mark: old.has(text) ? '' : 'added' })),
      ...before.filter((t) => !cur.has(t)).map((text): Line => ({ text, mark: 'removed' })),
    ];
  }
}
