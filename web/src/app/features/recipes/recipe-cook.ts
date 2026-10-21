import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { TPipe } from '../../core/i18n';
import { parseDurations } from '../../core/durations';
import { Recipe } from '../../core/models';
import { scaleQty } from '../../core/text-formats';
import { formatLeft, TimersService } from '../../core/timers';
import { QtyPipe, UnitPipe } from '../../shared/qty.pipe';

const KEY = 'calderone.cook.';

/**
 * The cooking mode ("Cucina", docs/design.md §8): ingredients, steps and timers on one screen, nothing else. All steps
 * stay in one scroll list; the current one is large, the previous and next stay at normal size, the rest is muted and
 * clamped. Ingredients sit in a collapsible band with quantities (tap to tick off), the servings stepper rescales them
 * in place. A duration in a step's text becomes a timer button. The screen stays awake while it is open.
 */
@Component({
  selector: 'app-recipe-cook',
  imports: [QtyPipe, UnitPipe, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="cook">
      <header class="cook-head">
        <button type="button" class="icon cook-back" (click)="leave.emit()" [attr.aria-label]="'cook.leave' | t">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        <h1 class="cook-title">{{ recipe().title }}</h1>
        <div class="stepper" role="group" [attr.aria-label]="'recipe.servings_title' | t">
          <button type="button" (click)="servings.set(max(1, servings() - 1))" [attr.aria-label]="'recipe.one_less' | t">−</button>
          <span aria-live="polite" class="cook-servings">{{ servings() }}</span>
          <button type="button" (click)="servings.set(servings() + 1)" [attr.aria-label]="'recipe.one_more' | t">+</button>
        </div>
      </header>

      <section class="cook-ing" [class.open]="ingOpen()">
        <button type="button" class="cook-ing-toggle" [attr.aria-expanded]="ingOpen()" aria-controls="cook-ing-list"
          (click)="ingOpen.set(!ingOpen())">
          {{ 'cook.ingredients' | t: { n: scaled().length } }}
          <span aria-hidden="true">{{ ingOpen() ? '▴' : '▾' }}</span>
        </button>
        <ul id="cook-ing-list" [hidden]="!ingOpen()">
          @for (i of scaled(); track $index) {
            <li>
              <button type="button" class="ing-tick" [class.done]="ticked().has($index)" [attr.aria-pressed]="ticked().has($index)"
                (click)="tick($index)">
                <span class="ing-name">{{ i.name }}@if (i.optional) { <span class="muted"> ({{ 'recipe.optional' | t }})</span> }</span>
                <span class="ing-qty">{{ i.qty === null ? '' : (i.qty | qty) }} {{ i.unit | unit }}</span>
              </button>
            </li>
          }
        </ul>
      </section>

      <ol class="cook-steps">
        @for (s of steps(); track $index) {
          <li
            [id]="'cook-step-' + $index"
            [class.current]="$index === current()"
            [class.near]="$index !== current() && distance($index) === 1"
            [class.far]="distance($index) > 1"
            [attr.aria-current]="$index === current() ? 'step' : null"
          >
            <button type="button" class="step-pick" (click)="goto($index)"
              [attr.aria-label]="('cook.step_n' | t: { n: $index + 1, total: steps().length }) + (s.title ? ': ' + s.title : '')">
              <span class="step-n">{{ $index + 1 }}</span>
              @if (s.title) { <strong>{{ s.title }}</strong> }
            </button>
            <p>{{ s.text }}</p>
            @if ($index === current() || distance($index) === 1) {
              @for (ms of s.timers; track $index) {
                <button type="button" class="cook-timer" (click)="startTimer(ms)">
                  {{ 'cook.timer' | t: { time: fmt(ms) } }}
                </button>
              }
            }
          </li>
        }
      </ol>

      @if (recipe().notes) {
        <section class="cook-notes">
          <h2>{{ 'recipe.notes' | t }}</h2>
          <p class="pre">{{ recipe().notes }}</p>
        </section>
      }

      <div class="cook-bar">
        <button type="button" (click)="goto(current() - 1)" [disabled]="current() === 0">{{ 'cook.prev' | t }}</button>
        @if (current() < steps().length - 1) {
          <button type="button" class="primary" (click)="goto(current() + 1)">{{ 'cook.next' | t }}</button>
        } @else {
          <button type="button" class="primary" (click)="leave.emit()">{{ 'cook.finish' | t }}</button>
        }
      </div>
    </div>
  `,
})
export class RecipeCook {
  readonly recipe = input.required<Recipe>();
  readonly servings = model.required<number>();
  readonly leave = output<void>();

  private timers = inject(TimersService);
  protected fmt = formatLeft;
  protected max = Math.max;
  protected ingOpen = signal(false);
  protected ticked = signal<ReadonlySet<number>>(new Set());
  protected current = signal(0);

  protected scaled = computed(() => {
    const r = this.recipe();
    return r.ingredients.map((i) => ({ ...i, qty: scaleQty(i.qty, r.servings, this.servings()) }));
  });
  /** Steps with the timers their text offers. */
  protected steps = computed(() =>
    this.recipe().steps.map((s) => ({ ...s, timers: parseDurations(`${s.title ?? ''} ${s.text}`) })),
  );

  constructor() {
    document.body.classList.add('cooking');
    let lock: WakeLockSentinel | null = null;
    const wake = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        /* not supported or refused: the screen may dim, nothing else */
      }
    };
    const visible = () => document.visibilityState === 'visible' && wake();
    wake();
    document.addEventListener('visibilitychange', visible);
    inject(DestroyRef).onDestroy(() => {
      document.body.classList.remove('cooking');
      document.removeEventListener('visibilitychange', visible);
      lock?.release().catch(() => undefined);
    });
    // back where you were (same tab, same recipe)
    queueMicrotask(() => {
      const saved = Number(read(KEY + this.recipe().id));
      if (Number.isInteger(saved) && saved > 0 && saved < this.steps().length) this.current.set(saved);
    });
  }

  protected distance(i: number): number {
    return Math.abs(i - this.current());
  }

  protected goto(i: number): void {
    if (i < 0 || i >= this.steps().length) return;
    this.current.set(i);
    write(KEY + this.recipe().id, String(i));
    // keep the current step in view (instant for people who asked for less motion)
    requestAnimationFrame(() =>
      document.getElementById('cook-step-' + i)?.scrollIntoView({
        block: 'center',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      }),
    );
  }

  protected tick(i: number): void {
    this.ticked.update((s) => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }

  protected async startTimer(ms: number): Promise<void> {
    await this.timers.add(ms);
  }
}

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode: only for this visit */
  }
}
