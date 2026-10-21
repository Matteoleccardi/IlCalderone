import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { TPipe } from '../core/i18n';
import { MAX_TIMERS, TimersService, formatLeft } from '../core/timers';
import { DurationWheel } from './duration-wheel';

/**
 * Kitchen timers on every page: a thin tab on the right edge; tap it or swipe it left to slide out a narrow column
 * of up to 5 timers. Swipe right (or tap the tab) to put it away. A new timer's length is chosen on wheels
 * (shared/duration-wheel.ts).
 */
@Component({
  selector: 'app-timer-dock',
  imports: [DurationWheel, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <aside
      class="timer-dock"
      [class.open]="open()"
      [class.ringing]="timers.ringing().length > 0"
      (touchstart)="touchStart($event)"
      (touchend)="touchEnd($event)"
      [attr.aria-label]="'timer.title' | t"
    >
      <button
        type="button"
        class="timer-tab"
        (click)="open.set(!open())"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="(open() ? 'timer.close' : 'timer.open') | t"
      >
        <span aria-hidden="true">⏱</span>
        @if (soonest(); as s) {
          <span class="timer-tab-left">{{ s }}</span>
        }
      </button>
      <!-- announces a ringing timer to screen readers (the beep and the pulse are not enough) -->
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
              <span class="small">{{ done ? ('timer.stop' | t) : t.end === null ? '▶ ' + fmt(t.dur) : '⏸ ' + fmt(t.dur) }}</span>
            </button>
            @if (done) {
              <button type="button" class="timer-x" (click)="timers.restart(t.id)" [attr.aria-label]="'timer.again' | t">↻</button>
            } @else {
              <button type="button" class="timer-x" (click)="timers.remove(t.id)" [attr.aria-label]="'timer.remove' | t">✕</button>
            }
          </div>
        }
        @for (s of free(); track s) {
          <button type="button" class="timer-row timer-add" (click)="pick()" [attr.aria-label]="'timer.new' | t">＋</button>
        }
        @if (timers.permission() !== 'granted') {
          <p class="timer-note">
            @if (timers.permission() === 'default') {
              <button type="button" class="link" (click)="timers.askPermission()"><span aria-hidden="true">🔔</span> {{ 'timer.allow' | t }}</button>
            } @else {
              <span aria-hidden="true">🔕</span> {{ 'timer.no_notify' | t }}
            }
          </p>
        }
      </div>
    </aside>
    @if (picking()) {
      <app-duration-wheel (start)="start($event)" (cancel)="picking.set(false)" />
    }
  `,
})
export class TimerDock {
  protected timers = inject(TimersService);
  protected open = signal(false);
  protected picking = signal(false);
  protected fmt = formatLeft;

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

  /** Opens the full-screen wheel picker for a new timer. */
  protected pick(): void {
    this.picking.set(true);
  }

  /** Started from the picker: a tap, so it can also unlock sound and ask for notifications. */
  protected async start(ms: number): Promise<void> {
    this.picking.set(false);
    this.open.set(true);
    await this.timers.add(ms);
  }

  private x0: number | null = null;
  private y0 = 0;

  protected touchStart(ev: TouchEvent): void {
    this.x0 = ev.touches[0]?.clientX ?? null;
    this.y0 = ev.touches[0]?.clientY ?? 0;
  }

  /** A mostly horizontal swipe: left opens, right closes. */
  protected touchEnd(ev: TouchEvent): void {
    const t = ev.changedTouches[0];
    if (this.x0 === null || !t) return;
    const dx = t.clientX - this.x0;
    const dy = t.clientY - this.y0;
    this.x0 = null;
    if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    this.open.set(dx < 0);
  }
}
