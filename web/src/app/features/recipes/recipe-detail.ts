import { NgComponentOutlet } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { FEATURES } from '../../core/features';
import { HouseholdsService } from '../../core/households';
import { I18n, TPipe } from '../../core/i18n';
import { Recipe, RecipeSummary } from '../../core/models';
import { Notify } from '../../core/notify';
import { SessionService } from '../../core/session';
import { scaleQty } from '../../core/text-formats';
import { AppTitle } from '../../core/title';
import { QtyPipe, UnitPipe } from '../../shared/qty.pipe';
import { VisibilityBadge } from '../../shared/visibility-badge';

@Component({
  selector: 'app-recipe-detail',
  imports: [FormsModule, RouterLink, NgComponentOutlet, QtyPipe, UnitPipe, VisibilityBadge, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './recipe-detail.html',
})
export class RecipeDetail {
  readonly id = input.required<string>();
  protected recipe = signal<Recipe | null>(null);
  protected servings = signal(4);
  protected kinds = ['variant', 'adaptation', 'inspired'];
  protected api = inject(Api);
  protected households = inject(HouseholdsService);
  private router = inject(Router);
  private notify = inject(Notify);
  private session = inject(SessionService);
  private title = inject(AppTitle);
  private features = inject(FEATURES);
  private i18n = inject(I18n);

  /** Recipe-page panels contributed by the enabled features (collections, diary…). */
  protected panels = computed(() =>
    this.features
      .filter((f) => !f.module || this.session.has(f.module))
      .flatMap((f) => f.recipePanels ?? []),
  );

  protected scaled = computed(() => {
    const r = this.recipe();
    if (!r) return [];
    return r.ingredients.map((i) => ({ ...i, qty: scaleQty(i.qty, r.servings, this.servings()) }));
  });

  // linking to another parent recipe (owner only)
  protected linking = signal(false);
  protected candidates = signal<RecipeSummary[]>([]);
  protected linkParent = '';
  protected linkKind = 'variant';

  constructor() {
    effect(() => {
      this.load(this.id());
    });
    this.households.ensure();
  }

  private async load(id: string): Promise<void> {
    this.recipe.set(null);
    try {
      const r = await this.api.get<Recipe>(`recipes/${id}`);
      this.recipe.set(r);
      this.servings.set(r.servings);
      this.title.set(r.title);
    } catch (e) {
      this.notify.error(e);
      this.router.navigateByUrl('/ricette');
    }
  }

  changeServings(delta: number): void {
    this.servings.update((s) => Math.max(1, s + delta));
  }

  async variant(): Promise<void> {
    try {
      const v = await this.api.post<Recipe>(`recipes/${this.id()}/variant`, {
        label: this.i18n.t('recipe.variant_word'),
      });
      this.notify.ok('recipe.variant_created');
      this.router.navigate(['/ricette', v.id, 'modifica']);
    } catch (e) {
      this.notify.error(e);
    }
  }

  async remove(): Promise<void> {
    const r = this.recipe();
    if (!r || !confirm(this.i18n.t('recipe.confirm_delete', { title: r.title }))) return;
    try {
      await this.api.delete(`recipes/${r.id}`);
      this.notify.ok('recipe.deleted');
      this.router.navigateByUrl('/ricette');
    } catch (e) {
      this.notify.error(e);
    }
  }

  async startLinking(): Promise<void> {
    const all = await this.api.get<RecipeSummary[]>('recipes');
    const r = this.recipe()!;
    const taken = new Set([r.id, ...r.parents.map((p) => p.id)]);
    this.candidates.set(all.filter((x) => !taken.has(x.id)));
    this.linking.set(true);
  }

  async link(): Promise<void> {
    if (!this.linkParent) return;
    try {
      this.recipe.set(
        await this.api.post<Recipe>(`recipes/${this.id()}/parents`, {
          parent: this.linkParent,
          kind: this.linkKind,
        }),
      );
      this.linking.set(false);
      this.linkParent = '';
    } catch (e) {
      this.notify.error(e);
    }
  }

  async unlink(parentId: string): Promise<void> {
    try {
      this.recipe.set(await this.api.delete<Recipe>(`recipes/${this.id()}/parents/${parentId}`));
    } catch (e) {
      this.notify.error(e);
    }
  }
}
