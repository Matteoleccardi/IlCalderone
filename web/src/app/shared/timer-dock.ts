import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { TPipe } from '../core/i18n';
import { TimerSide } from '../core/timer-side';
import { MAX_TIMERS, TimersService, formatLeft } from '../core/timers';
import { DurationWheel } from './duration-wheel';
import { Assist, AssistState, inBand } from './timer-assist';

/**
 * Kitchen timers on every page: a thin tab on the left or right screen edge (Account → Timer); tap it or swipe it
 * towards the middle to slide out a narrow column of up to 5 timers. A touch in the 24px band along that edge makes
 * the tab bigger for 1.5 s (a second miss makes its tappable area bigger still), see shared/timer-assist.ts.
 * A new timer's length is chosen on wheels (shared/duration-wheel.ts).
 */
@Component({
  selector: 'app-timer-dock',
  imports: [DurationWheel, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { '(document:pointerdown)': 'band($event)' },
  template: `
    <aside
      class="timer-dock"
      [class.open]="open()"
      [class.big]="assist().enlarged"
      [class.help]="assist().help"
      [class.ringing]="timers.ringing().length > 0"
      [attr.data-side]="sideSvc.side()"
      (touchstart)="touchStart($event)"
      (touchend)="touchEnd($event)"
      [attr.aria-label]="'timer.title' | t"
    >
      <button
        type="button"
        class="timer-tab"
        (click)="open.set(!open())"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="'timer.title' | t"
      >
        <span aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4l2.5 1.5M9.5 3h5M12 3v3" /></svg></span>
        @if (soonest(); as s) {
          <span class="timer-tab-left">{{ s }}</span>
        }
      </button>
      <!-- announces a ringing timer to screen readers (the beep and the colour are not enough) -->
      <p class="sr-only" role="alert">@if (timers.ringing().length) { {{ 'timer.ringing' | t }} }</p>
      <div class="timer-panel" [attr.inert]="open() ? null : ''">
        @for (t of timers.timers(); track t.id) {
          @let done = timers.isDone(t);
          <div class="timer-row" [class.done]="done" [class.paused]="t.end === null">
            <button
              type="button"
              class="timer-time"
              (click)="done ? timers.remove(t.id) : timers.toggle(t.id)"
              [attr.aria-label]="(done ? 'timer.stop' : t.end === null ? 'timer.resume' : 'timer.pause') | t"
            >
              <span class="big">{{ fmt(timers.left(t)) }}</span>
              <span class="small">{{ done ? ('timer.done' | t) : t.end === null ? ('timer.paused' | t) : fmt(t.dur) }}</span>
            </button>
            @if (done) {
              <button type="button" class="timer-x" (click)="timers.restart(t.id)" [attr.aria-label]="'timer.again' | t"><span aria-hidden="true">↻</span></button>
            } @else {
              <button type="button" class="timer-x" (click)="timers.remove(t.id)" [attr.aria-label]="'timer.remove' | t"><span aria-hidden="true">✕</span></button>
            }
          </div>
        }
        @for (s of free(); track s) {
          <button type="button" class="timer-row timer-add" (click)="timers.picking.set(true)" [attr.aria-label]="'timer.new' | t"><span aria-hidden="true">+</span></button>
        }
      </div>
    </aside>
    @if (timers.picking()) {
      <app-duration-wheel (start)="start($event)" (cancel)="timers.picking.set(false)" />
    }
  `,
})
export class TimerDock {
  protected timers = inject(TimersService);
  protected sideSvc = inject(TimerSide);
  protected open = signal(false);
  protected assist = signal<AssistState>({ enlarged: false, help: false });
  protected fmt = formatLeft;
  private helper = new Assist((s) => this.assist.set(s));

  /** Empty rows up to 5 (an index per free slot). */
  protected free = computed(() =>
    Array.from({ length: MAX_TIMERS - this.timers.timers().length }, (_, i) => this.timers.timers().length + i),
  );
  /** What the closed tab shows: the time of the timer that ends first. */
  protected soonest = computed(() => {
    if (this.timers.ringing().length) return '0:00';
    const run = this.timers.running();
    if (!run.length) return null;
    return formatLeft(Math.min(...run.map((t) => this.timers.left(t))));
  });

  /** A touch near the screen edge: help find the tab. Passive: the page under the band still gets its tap. */
  protected band(ev: PointerEvent): void {
    if (this.open() || this.timers.picking() || !inBand(ev.clientX, innerWidth, this.sideSvc.side())) return;
    this.helper.touch(!!(ev.target as Element | null)?.closest?.('.timer-tab'));
  }

  /** Started from the picker: a tap, so it can also unlock sound and ask for notifications. */
  protected async start(ms: number): Promise<void> {
    this.timers.picking.set(false);
    this.open.set(true);
    await this.timers.add(ms);
  }

  private x0: number | null = null;
  private y0 = 0;

  protected touchStart(ev: TouchEvent): void {
    this.x0 = ev.touches[0]?.clientX ?? null;
    this.y0 = ev.touches[0]?.clientY ?? 0;
  }

  /** A mostly horizontal swipe: towards the middle of the screen opens, towards the edge closes. */
  protected touchEnd(ev: TouchEvent): void {
    const t = ev.changedTouches[0];
    if (this.x0 === null || !t) return;
    const dx = t.clientX - this.x0;
    const dy = t.clientY - this.y0;
    this.x0 = null;
    if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    this.open.set(this.sideSvc.side() === 'right' ? dx < 0 : dx > 0);
  }
}
