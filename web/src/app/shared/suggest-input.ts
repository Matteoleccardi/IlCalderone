import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { fold } from './recipe-picker';

/** Suggestions for what has been typed: those starting with it first, then those containing it (accents and case ignored). */
export function suggest(options: readonly string[], query: string, max = 50): string[] {
  const q = fold(query.trim());
  if (!q) return options.slice(0, max);
  const starts: string[] = [];
  const inside: string[] = [];
  for (const o of options) {
    const t = fold(o);
    if (t.startsWith(q)) starts.push(o);
    else if (t.includes(q)) inside.push(o);
  }
  const all = [...starts, ...inside];
  // the only suggestion is exactly what is typed: nothing to offer (a different case or accents still is: it is the proper spelling)
  if (all.length === 1 && all[0] === query.trim()) return [];
  return all.slice(0, max);
}

/**
 * A text box that suggests values from a list as you type and also takes any other text. Built by hand instead of
 * <datalist>, which many phone browsers show badly or not at all (same markup and styles as recipe-picker.ts).
 */
@Component({
  selector: 'app-suggest-input',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="picker">
      <input
        #box
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        [value]="value()"
        [placeholder]="placeholder()"
        [attr.aria-label]="label() || placeholder()"
        [attr.aria-expanded]="shown()"
        [attr.aria-controls]="shown() ? uid + '-list' : null"
        [attr.aria-activedescendant]="active() >= 0 ? uid + '-' + active() : null"
        (input)="typed(box.value)"
        (focus)="open.set(true)"
        (blur)="open.set(false)"
        (keydown)="key($event)"
      />
      @if (shown()) {
        <ul class="picker-list" [class.end]="align() === 'end'" role="listbox" [id]="uid + '-list'">
          @for (o of matches(); track o; let i = $index) {
            <li
              role="option"
              [id]="uid + '-' + i"
              [class.active]="i === active()"
              [attr.aria-selected]="i === active()"
              (pointerdown)="$event.preventDefault()"
              (click)="choose(o)"
            >
              {{ o }}
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class SuggestInput {
  readonly value = model('');
  readonly options = input.required<readonly string[]>();
  readonly placeholder = input('');
  /** Accessible name when it should say more than the placeholder. */
  readonly label = input('');
  /** Which edge of the field the list lines up with ("end" for fields near the right edge of the screen). */
  readonly align = input<'start' | 'end'>('start');

  private static next = 0;
  protected uid = `suggest-${SuggestInput.next++}`;
  protected open = signal(false);
  protected active = signal(-1);
  protected matches = computed(() => suggest(this.options(), this.value()));
  protected shown = computed(() => this.open() && this.matches().length > 0);

  protected typed(v: string): void {
    this.value.set(v);
    this.active.set(-1);
    this.open.set(true);
  }

  protected key(e: KeyboardEvent): void {
    const n = this.matches().length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) return;
      e.preventDefault();
      this.open.set(true);
      this.active.update((i) => (e.key === 'ArrowDown' ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
    } else if (e.key === 'Escape') {
      if (this.shown()) {
        e.preventDefault();
        this.open.set(false);
      }
    } else if (e.key === 'Enter' && this.shown() && this.active() >= 0) {
      e.preventDefault(); // pick the suggestion instead of submitting the form
      this.choose(this.matches()[this.active()]);
    }
  }

  protected choose(o: string): void {
    this.value.set(o);
    this.active.set(-1);
    this.open.set(false);
  }
}
