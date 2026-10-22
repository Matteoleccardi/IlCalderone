import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  output,
  signal,
  viewChildren,
  ChangeDetectionStrategy,
} from '@angular/core';
import { TPipe } from '../core/i18n';
import { formatLeft } from '../core/timers';

const ITEM = 44; // px, one row of a wheel (keep in sync with .wheel-item in styles.css)
const LAST_KEY = 'calderone.timer.last';

/** ms → [hours, minutes, seconds] (hours capped at 23). */
export function splitDuration(ms: number): [number, number, number] {
  const s = Math.max(0, Math.round(ms / 1000));
  return [Math.min(23, Math.floor(s / 3600)), Math.floor((s % 3600) / 60), s % 60];
}

export function joinDuration(h: number, m: number, s: number): number {
  return ((h * 60 + m) * 60 + s) * 1000;
}

interface Col {
  key: 'h' | 'm' | 's';
  max: number;
  label: string;
}

/**
 * Full-screen picker for a timer's length: three wheels (hours, minutes, seconds) to scroll with a finger, plus
 * quick presets. Remembers the last length used. Esc or "Cancel" closes it.
 */
@Component({
  selector: 'app-duration-wheel',
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <div class="wheel-overlay" role="dialog" aria-modal="true" aria-labelledby="wheel-title" #box>
      <h2 id="wheel-title"><span aria-hidden="true">⏱</span> {{ 'timer.new' | t }}</h2>
      <p class="wheel-total" aria-live="polite">{{ fmt(total()) }}</p>
      <div class="wheels">
        <div class="wheel-band" aria-hidden="true"></div>
        @for (c of cols; track c.key; let i = $index) {
          <div class="wheel-col">
            <div
              class="wheel"
              #wheel
              tabindex="0"
              role="spinbutton"
              [attr.aria-label]="c.label | t"
              aria-valuemin="0"
              [attr.aria-valuemax]="c.max"
              [attr.aria-valuenow]="values()[i]"
              [attr.aria-valuetext]="values()[i] + ' ' + (c.label | t)"
              (scroll)="onScroll(i)"
              (keydown)="onWheelKey($event, i)"
            >
              <div class="wheel-pad"></div>
              @for (n of range(c.max); track n) {
                <div class="wheel-item" [class.sel]="n === values()[i]" (click)="set(i, n, true)">{{ pad(n) }}</div>
              }
              <div class="wheel-pad"></div>
            </div>
            <span class="wheel-label">{{ c.label | t }}</span>
          </div>
        }
      </div>
      <div class="wheel-presets">
        @for (p of presets; track p) {
          <button type="button" class="chip-btn" [class.on]="total() === p * 60000" (click)="preset(p)">
            {{ p < 60 ? ('timer.preset_min' | t: { n: p }) : ('timer.preset_h' | t: { n: p / 60 }) }}
          </button>
        }
      </div>
      <p class="actions wheel-actions">
        <button type="button" (click)="cancel.emit()">{{ 'common.cancel' | t }}</button>
        <button type="button" class="primary" [disabled]="total() === 0" (click)="go()">▶ {{ 'timer.start_short' | t }}</button>
      </p>
    </div>
  `,
})
export class DurationWheel implements AfterViewInit, OnDestroy {
  readonly start = output<number>();
  readonly cancel = output<void>();

  protected cols: Col[] = [
    { key: 'h', max: 23, label: 'timer.hours' },
    { key: 'm', max: 59, label: 'timer.min_label' },
    { key: 's', max: 59, label: 'timer.sec_label' },
  ];
  protected presets = [1, 3, 5, 9, 10, 11, 15, 20, 30, 45, 60];
  protected values = signal<[number, number, number]>(splitDuration(readLast()));
  protected total = computed(() => joinDuration(...this.values()));
  protected fmt = formatLeft;

  private wheels = viewChildren<ElementRef<HTMLElement>>('wheel');
  private timers: (ReturnType<typeof setTimeout> | undefined)[] = [];
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private opener: HTMLElement | null = null;
  private overflow = '';

  ngAfterViewInit(): void {
    this.opener = document.activeElement as HTMLElement | null;
    this.overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // the page behind doesn't scroll
    this.values().forEach((v, i) => this.scrollTo(i, v, false));
    this.wheels()[1]?.nativeElement.focus({ preventScroll: true });
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.overflow;
    this.timers.forEach((t) => clearTimeout(t));
    this.opener?.focus?.({ preventScroll: true });
  }

  protected range(max: number): number[] {
    return Array.from({ length: max + 1 }, (_, i) => i);
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  /** While scrolling: take the row under the band once the wheel settles. */
  protected onScroll(i: number): void {
    clearTimeout(this.timers[i]);
    this.timers[i] = setTimeout(() => {
      const el = this.wheels()[i]?.nativeElement;
      if (!el) return;
      const n = Math.max(0, Math.min(this.cols[i].max, Math.round(el.scrollTop / ITEM)));
      this.set(i, n, false);
    }, 90);
  }

  protected set(i: number, n: number, scroll: boolean): void {
    this.values.update((v) => {
      const next = [...v] as [number, number, number];
      next[i] = n;
      return next;
    });
    if (scroll) this.scrollTo(i, n, true);
  }

  protected onWheelKey(ev: KeyboardEvent, i: number): void {
    const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[ev.key];
    if (step === undefined && ev.key !== 'Home' && ev.key !== 'End') return;
    ev.preventDefault();
    const max = this.cols[i].max;
    const cur = this.values()[i];
    const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? max : Math.max(0, Math.min(max, cur + (step ?? 0)));
    this.set(i, n, true);
  }

  protected preset(min: number): void {
    const v = splitDuration(min * 60000);
    this.values.set(v);
    v.forEach((n, i) => this.scrollTo(i, n, true));
  }

  protected go(): void {
    const ms = this.total();
    if (!ms) return;
    try {
      localStorage.setItem(LAST_KEY, String(ms));
    } catch {
      /* not remembered */
    }
    this.start.emit(ms);
  }

  /** Esc closes; Tab stays inside the picker. */
  protected onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.cancel.emit();
      return;
    }
    if (ev.key !== 'Tab') return;
    const items = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'),
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  private scrollTo(i: number, n: number, smooth: boolean): void {
    const el = this.wheels()[i]?.nativeElement;
    if (!el) return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: n * ITEM, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }
}

function readLast(): number {
  try {
    const n = Number(localStorage.getItem(LAST_KEY));
    return Number.isFinite(n) && n > 0 ? n : 10 * 60000;
  } catch {
    return 10 * 60000;
  }
}
