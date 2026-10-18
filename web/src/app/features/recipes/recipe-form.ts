import { Component, OnInit, WritableSignal, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { AppError, I18n, TPipe } from '../../core/i18n';
import { shrinkImage } from '../../core/image';
import { Recipe, Step, Visibility, Vocabulary } from '../../core/models';
import { Notify } from '../../core/notify';
import { fmtQty, ingredientsToText, parseIngredients, parseQty, parseSteps, stepsToText } from '../../core/text-formats';
import { ScopePicker } from '../../shared/scope-picker';

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
  imports: [FormsModule, RouterLink, ScopePicker, TPipe],
  templateUrl: './recipe-form.html',
})
export class RecipeForm implements OnInit {
  readonly id = input<string>();
  protected loaded = signal(false);
  protected busy = signal(false);
  protected vocab = signal<Vocabulary>({ ingredients: [], units: [], categories: [], tags: [] });

  protected title = '';
  protected servings = 4;
  protected time: number | null = null;
  protected category = '';
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

  protected api = inject(Api);
  private router = inject(Router);
  private notify = inject(Notify);
  private i18n = inject(I18n);

  async ngOnInit(): Promise<void> {
    this.api.get<Vocabulary>('recipes/vocabulary').then((v) => this.vocab.set(v), () => {});
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
        this.category = r.category;
        this.tags = r.tags.join(', ');
        this.notes = r.notes;
        this.takenFrom = r.taken_from;
        this.visibility.set(r.visibility);
        this.household.set(r.household);
        this.rows.set(r.ingredients.map((i) => ({ ...i, qty: i.qty === null ? 'q.b.' : fmtQty(i.qty, this.i18n.lang) })));
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

  addRow(): void {
    this.rows.update((r) => [...r, this.emptyRow()]);
  }

  removeRow(i: number): void {
    this.rows.update((r) => r.filter((_, k) => k !== i));
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
  }

  removeStep(i: number): void {
    this.steps.update((s) => s.filter((_, k) => k !== i));
  }

  /** Switch between the row editor and the plain-text editor, converting the content. */
  toggleText(): void {
    try {
      if (!this.textMode()) {
        this.ingText = ingredientsToText(this.collectIngredients(), this.i18n.t('form.optional_word'), this.i18n.lang);
        this.stepText = stepsToText(this.steps().filter((s) => s.title || s.text));
      } else {
        this.rows.set(parseIngredients(this.ingText).map((i) => ({ ...i, qty: i.qty === null ? 'q.b.' : fmtQty(i.qty, this.i18n.lang) })));
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
          return { name: r.name.trim(), qty, unit: r.unit.trim() || (qty === null ? 'q.b.' : ''), optional: r.optional, note: r.note.trim() };
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
    const body = {
      title: this.title, servings: this.servings, time_minutes: this.time, category: this.category,
      tags: this.tags.split(',').map((t) => t.trim()).filter(Boolean), notes: this.notes, taken_from: this.takenFrom,
      visibility: this.visibility(), household: this.household(), ingredients, steps,
    };
    this.busy.set(true);
    try {
      const id = this.id();
      let r = id ? await this.api.put<Recipe>(`recipes/${id}`, body) : await this.api.post<Recipe>('recipes', body);
      const photo = this.newPhoto();
      if (photo) {
        const fd = new FormData();
        fd.append('photo', photo, 'photo.jpg');
        r = await this.api.post<Recipe>(`recipes/${r.id}/photo`, fd);
      } else if (this.removePhoto() && r.photo) {
        r = await this.api.delete<Recipe>(`recipes/${r.id}/photo`);
      }
      this.notify.ok(id ? 'form.saved' : 'form.created');
      this.router.navigate(['/ricette', r.id]);
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
