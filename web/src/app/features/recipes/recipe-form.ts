import {
  Component,
  ElementRef,
  Injector,
  OnInit,
  WritableSignal,
  afterNextRender,
  inject,
  input,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { AppError, I18n, TPipe } from '../../core/i18n';
import { shrinkImage } from '../../core/image';
import { Recipe, Step, Visibility, Vocabulary } from '../../core/models';
import { Notify } from '../../core/notify';
import {
  fmtQty,
  ingredientsToText,
  parseIngredients,
  parseQty,
  parseSteps,
  stepsToText,
} from '../../core/text-formats';
import { Facets, FacetsService, blankFacets, facetValues, missingFacets, suggestDiet } from '../../core/facets';
import { HasUnsaved } from '../../core/guards';
import { FacetPicker } from '../../shared/facet-picker';
import { ScopePicker } from '../../shared/scope-picker';
import { SuggestInput } from '../../shared/suggest-input';

/** An ingredient row while editing: the quantity stays text ("1/2", "q.b.") until saving. */
interface Row {
  name: string;
  qty: string;
  unit: string;
  optional: boolean;
  note: string;
}

/** Create (/ricette/nuova) or edit (/ricette/:id/modifica) a recipe. */
@Component({
  selector: 'app-recipe-form',
  imports: [FacetPicker, FormsModule, RouterLink, ScopePicker, SuggestInput, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { '(window:beforeunload)': 'warnUnload($event)' },
  templateUrl: './recipe-form.html',
})
export class RecipeForm implements OnInit, HasUnsaved {
  readonly id = input<string>();
  protected loaded = signal(false);
  protected busy = signal(false);
  protected vocab = signal<Vocabulary>({ ingredients: [], units: [], tags: [] });

  protected title = '';
  protected servings = 4;
  protected time: number | null = null;
  private facetsSvc = inject(FacetsService);
  protected facetDefs = this.facetsSvc.defs;
  /** The classification being edited (the defaults are filled in once the definitions arrive). */
  protected facets = signal<Facets>({});
  /**
   * Diet that the ingredients suggest, when it differs from the chosen one. A method, not a computed: the rows are
   * edited in place by ngModel, so a signal would not notice.
   */
  protected dietHint(): string | null {
    const d = suggestDiet(this.rows().map((r) => r.name));
    return d && facetValues(this.facets(), 'diet')[0] !== d ? d : null;
  }
  protected tags = '';
  protected notes = '';
  protected takenFrom = '';
  protected visibility = signal<Visibility>('shared');
  protected household = signal<string | null>(null);
  protected rows = signal<Row[]>([this.emptyRow()]);
  protected steps = signal<Step[]>([{ title: '', text: '' }]);

  // "paste as text" editors
  protected textMode = signal(false);
  protected ingText = '';
  protected stepText = '';

  // photo
  protected existing = signal<Recipe | null>(null);
  protected newPhoto = signal<Blob | null>(null);
  protected preview = signal<string | null>(null);
  protected removePhoto = signal(false);
  // pixel-art icon (uploaded as is: a small PNG)
  protected newIcon = signal<File | null>(null);
  protected iconPreview = signal<string | null>(null);
  protected removeIcon = signal(false);
  // voxel model (MagicaVoxel .vox, uploaded as is)
  protected newModel = signal<File | null>(null);
  protected removeModel = signal(false);

  protected api = inject(Api);
  private router = inject(Router);
  private notify = inject(Notify);
  private i18n = inject(I18n);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private injector = inject(Injector);

  /** Something was typed or tapped since the page opened (and it was not saved yet). */
  protected edited = false;

  hasUnsaved(): boolean {
    return this.edited;
  }

  /** Closing the tab or reloading with unsaved edits asks first. */
  protected warnUnload(e: BeforeUnloadEvent): void {
    if (!this.edited) return;
    e.preventDefault();
    e.returnValue = '';
  }

  /** Taps on the editing buttons (add, remove, move, chips, suggestions) count as edits too; typing is caught by (input). */
  protected clicked(e: Event): void {
    if ((e.target as HTMLElement).closest('button[type="button"], [role="option"]')) this.edited = true;
  }

  /** Puts the focus on an element once the next render has created it. */
  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }

  async ngOnInit(): Promise<void> {
    this.facetsSvc.ensure().then(
      (d) => this.facets.update((f) => ({ ...blankFacets(d), ...f })),
      (e) => this.notify.error(e),
    );
    this.api.get<Vocabulary>('recipes/vocabulary').then(
      (v) => this.vocab.set(v),
      () => {},
    );
    const id = this.id();
    if (id) {
      try {
        const r = await this.api.get<Recipe>(`recipes/${id}`);
        if (!r.can_edit) {
          this.notify.error('err.recipe_edit_denied');
          this.router.navigate(['/ricette', id]);
          return;
        }
        this.existing.set(r);
        this.title = r.title;
        this.servings = r.servings;
        this.time = r.time_minutes;
        this.facets.update((f) => ({ ...f, ...(r.facets ?? {}) }));
        this.tags = r.tags.join(', ');
        this.notes = r.notes;
        this.takenFrom = r.taken_from;
        this.visibility.set(r.visibility);
        this.household.set(r.household);
        this.rows.set(
          r.ingredients.map((i) => ({
            ...i,
            qty: i.qty === null ? 'q.b.' : fmtQty(i.qty, this.i18n.lang),
          })),
        );
        this.steps.set(r.steps.length ? r.steps.map((s) => ({ ...s })) : [{ title: '', text: '' }]);
      } catch (e) {
        this.notify.error(e);
        this.router.navigateByUrl('/ricette');
        return;
      }
    }
    this.loaded.set(true);
  }

  emptyRow(): Row {
    return { name: '', qty: '', unit: '', optional: false, note: '' };
  }

  /** Names a row for screen readers while its name is still empty ("Zutat 2"). */
  protected rowLabel(r: Row, i: number): string {
    return r.name.trim() || `${this.i18n.t('form.ingredient')} ${i + 1}`;
  }

  protected stepLabel(s: Step, i: number): string {
    return s.title.trim() || `${this.i18n.t('form.step')} ${i + 1}`;
  }

  addRow(): void {
    this.rows.update((r) => [...r, this.emptyRow()]);
    this.focusAfterRender(`[data-row="${this.rows().length - 1}"] input`);
  }

  removeRow(i: number): void {
    this.rows.update((r) => r.filter((_, k) => k !== i));
    const n = this.rows().length;
    this.focusAfterRender(n ? `[data-row="${Math.min(i, n - 1)}"] .tools button:last-child` : '#add-row');
  }

  move<T>(list: WritableSignal<T[]>, i: number, delta: number): void {
    list.update((l) => {
      const j = i + delta;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  }

  addStep(): void {
    this.steps.update((s) => [...s, { title: '', text: '' }]);
    this.focusAfterRender(`[data-step="${this.steps().length - 1}"] input`);
  }

  removeStep(i: number): void {
    this.steps.update((s) => s.filter((_, k) => k !== i));
    const n = this.steps().length;
    this.focusAfterRender(n ? `[data-step="${Math.min(i, n - 1)}"] .tools button:last-child` : '#add-step');
  }

  /** Switch between the row editor and the plain-text editor, converting the content. */
  toggleText(): void {
    try {
      if (!this.textMode()) {
        this.ingText = ingredientsToText(
          this.collectIngredients(),
          this.i18n.t('form.optional_word'),
          this.i18n.lang,
        );
        this.stepText = stepsToText(this.steps().filter((s) => s.title || s.text));
      } else {
        this.rows.set(
          parseIngredients(this.ingText).map((i) => ({
            ...i,
            qty: i.qty === null ? 'q.b.' : fmtQty(i.qty, this.i18n.lang),
          })),
        );
        const s = parseSteps(this.stepText);
        this.steps.set(s.length ? s : [{ title: '', text: '' }]);
      }
      this.textMode.update((m) => !m);
    } catch (e) {
      this.notify.error(e);
    }
  }

  private collectIngredients() {
    return this.rows()
      .filter((r) => r.name.trim())
      .map((r, n) => {
        try {
          const qty = parseQty(r.qty);
          return {
            name: r.name.trim(),
            qty,
            unit: r.unit.trim() || (qty === null ? 'q.b.' : ''),
            optional: r.optional,
            note: r.note.trim(),
          };
        } catch (e) {
          throw new AppError('form.ingredient_error', { n: n + 1, name: r.name, error: e });
        }
      });
  }

  async pickPhoto(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const blob = await shrinkImage(file);
      this.newPhoto.set(blob);
      this.removePhoto.set(false);
      const old = this.preview();
      if (old) URL.revokeObjectURL(old);
      this.preview.set(URL.createObjectURL(blob));
    } catch (e) {
      this.notify.error(e);
    }
  }

  pickIcon(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.type !== 'image/png' || file.size > 65536) {
      this.notify.error(this.i18n.t('err.icon_type'));
      return;
    }
    this.newIcon.set(file);
    this.removeIcon.set(false);
    const old = this.iconPreview();
    if (old) URL.revokeObjectURL(old);
    this.iconPreview.set(URL.createObjectURL(file));
  }

  async pickModel(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (file.size > 262144 || String.fromCharCode(...head) !== 'VOX ') {
      this.notify.error(this.i18n.t(file.size > 262144 ? 'err.model_too_large' : 'err.model_type'));
      input.value = '';
      return;
    }
    this.newModel.set(file);
    this.removeModel.set(false);
  }

  protected useDiet(d: string): void {
    this.facets.update((f) => ({ ...f, diet: d }));
  }

  async save(): Promise<void> {
    let ingredients, steps;
    try {
      if (this.textMode()) this.toggleText(); // apply the text editors first
      ingredients = this.collectIngredients();
      steps = this.steps().filter((s) => s.title.trim() || s.text.trim());
    } catch (e) {
      this.notify.error(e);
      return;
    }
    const defs = this.facetDefs();
    if (defs && missingFacets(defs, this.facets()).length) {
      this.notify.error('err.facets_required');
      document.getElementById('facets')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const body = {
      title: this.title,
      servings: this.servings,
      time_minutes: this.time,
      facets: this.facets(),
      tags: this.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      notes: this.notes,
      taken_from: this.takenFrom,
      visibility: this.visibility(),
      household: this.household(),
      ingredients,
      steps,
    };
    this.busy.set(true);
    try {
      const id = this.id();
      let r = id
        ? await this.api.put<Recipe>(`recipes/${id}`, body)
        : await this.api.post<Recipe>('recipes', body);
      const photo = this.newPhoto();
      if (photo) {
        const fd = new FormData();
        fd.append('photo', photo, 'photo.jpg');
        r = await this.api.post<Recipe>(`recipes/${r.id}/photo`, fd);
      } else if (this.removePhoto() && r.photo) {
        r = await this.api.delete<Recipe>(`recipes/${r.id}/photo`);
      }
      const icon = this.newIcon();
      if (icon) {
        const fd = new FormData();
        fd.append('icon', icon, 'icon.png');
        r = await this.api.post<Recipe>(`recipes/${r.id}/icon`, fd);
      } else if (this.removeIcon() && r.icon) {
        r = await this.api.delete<Recipe>(`recipes/${r.id}/icon`);
      }
      const model = this.newModel();
      if (model) {
        const fd = new FormData();
        fd.append('model', model, 'model.vox');
        r = await this.api.post<Recipe>(`recipes/${r.id}/model`, fd);
      } else if (this.removeModel() && r.model) {
        r = await this.api.delete<Recipe>(`recipes/${r.id}/model`);
      }
      this.notify.ok(id ? 'form.saved' : 'form.created');
      this.edited = false; // saved: leaving is fine
      this.router.navigate(['/ricette', r.id]);
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
