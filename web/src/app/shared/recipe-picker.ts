import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { I18n, TPipe } from '../core/i18n';
import { RecipeSummary } from '../core/models';

/** What the picker hands back: a recipe, or free text such as "pizza out". */
export type Pick = { recipe: RecipeSummary; text?: undefined } | { recipe?: undefined; text: string };

/** Lower case without accents, for matching ("Pàsta" → "pasta"). */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * A text box that suggests recipes as you type, in alphabetical order (case-insensitive), and also accepts free
 * text. Built by hand instead of <datalist>, which many phone browsers show badly or not at all.
 */
@Component({
  selector: 'app-recipe-picker',
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="picker">
      <input
        #box
        type="text"
        role="combobox"
        autocomplete="off"
        enterkeyhint="done"
        [class.add]="dashed()"
        [value]="query()"
        [placeholder]="placeholder()"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        [attr.aria-label]="label() || placeholder()"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? uid + '-list' : null"
        [attr.aria-activedescendant]="active() >= 0 ? uid + '-' + active() : null"
        (input)="query.set(box.value); active.set(-1); open.set(true)"
        (focus)="open.set(true)"
        (blur)="open.set(false)"
        (keydown)="key($event)"
      />
      @if (open() && (matches().length || offerText())) {
        <ul class="picker-list" role="listbox" [id]="uid + '-list'">
          @for (r of matches(); track r.id; let i = $index) {
            <li
              role="option"
              [id]="uid + '-' + i"
              [class.active]="i === active()"
              [attr.aria-selected]="i === active()"
              (pointerdown)="$event.preventDefault()"
              (click)="choose({ recipe: r })"
            >
              {{ r.title }}
            </li>
          }
          @if (offerText()) {
            <li
              role="option"
              class="as-text"
              [id]="uid + '-' + matches().length"
              [class.active]="active() === matches().length"
              (pointerdown)="$event.preventDefault()"
              (click)="choose({ text: query().trim() })"
            >
              {{ 'picker.as_text' | t: { text: query().trim() } }}
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class RecipePicker {
  readonly recipes = input.required<RecipeSummary[]>();
  readonly placeholder = input('');
  /** Accessible name when it should say more than the placeholder (e.g. which day and meal). */
  readonly label = input('');
  /** Accept free text as well as recipes. */
  readonly allowText = input(true);
  /** Dashed "add" look (menu grid). */
  readonly dashed = input(false);
  readonly picked = output<Pick>();

  private i18n = inject(I18n);
  private static next = 0;
  protected uid = `picker-${RecipePicker.next++}`;
  protected query = signal('');
  protected open = signal(false);
  protected active = signal(-1);

  private sorted = computed(() => [...this.recipes()].sort((a, b) => this.i18n.compare(a.title, b.title)));

  /** Titles containing the typed text (anywhere, ignoring case and accents); those starting with it come first. */
  protected matches = computed(() => {
    const q = fold(this.query().trim());
    if (!q) return this.sorted().slice(0, 50);
    const starts: RecipeSummary[] = [];
    const inside: RecipeSummary[] = [];
    for (const r of this.sorted()) {
      const t = fold(r.title);
      if (t.startsWith(q)) starts.push(r);
      else if (t.includes(q)) inside.push(r);
    }
    return [...starts, ...inside].slice(0, 50);
  });

  protected offerText = computed(() => {
    const q = fold(this.query().trim());
    return this.allowText() && q !== '' && !this.matches().some((r) => fold(r.title) === q);
  });

  protected key(e: KeyboardEvent): void {
    const n = this.matches().length + (this.offerText() ? 1 : 0);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.open.set(true);
      if (n) this.active.update((i) => (i + (e.key === 'ArrowDown' ? 1 : n - 1) + (i < 0 && e.key === 'ArrowUp' ? 1 : 0)) % n);
    } else if (e.key === 'Escape') {
      this.open.set(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const i = this.active();
      const q = this.query().trim();
      const exact = this.matches().find((r) => fold(r.title) === fold(q));
      if (i >= 0 && i < this.matches().length) this.choose({ recipe: this.matches()[i] });
      else if (exact) this.choose({ recipe: exact });
      else if (q && this.allowText()) this.choose({ text: q });
      else if (this.matches().length === 1) this.choose({ recipe: this.matches()[0] });
    }
  }

  protected choose(p: Pick): void {
    this.picked.emit(p);
    this.query.set('');
    this.active.set(-1);
    this.open.set(false);
  }
}
