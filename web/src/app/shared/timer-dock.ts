import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { TPipe } from '../core/i18n';
import { MAX_TIMERS, TimersService, formatLeft, parseDuration } from '../core/timers';

/**
 * Kitchen timers on every page: a thin tab on the right edge; tap it or swipe it left to slide out a narrow column
 * of up to 5 timers. Swipe right (or tap the tab) to put it away.
 */
@Component({
  selector: 'app-timer-dock',
  imports: [TPipe],
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
          <form class="timer-row timer-new" (submit)="$event.preventDefault(); start(s)">
            <input
              [id]="'timer-new-' + s"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              [placeholder]="'timer.minutes' | t"
              [attr.aria-label]="'timer.minutes_label' | t"
              [value]="draft()[s] ?? ''"
              (input)="setDraft(s, $any($event.target).value)"
              [class.bad]="bad() === s"
            />
            <button type="submit" class="timer-x" [attr.aria-label]="'timer.start' | t">▶</button>
          </form>
        }
        @if (timers.permission() !== 'granted') {
          <p class="timer-note">
            @if (timers.permission() === 'default') {
              <button type="button" class="link" (click)="timers.askPermission()">🔔 {{ 'timer.allow' | t }}</button>
            } @else {
              🔕 {{ 'timer.no_notify' | t }}
            }
          </p>
        }
      </div>
    </aside>
  `,
})
export class TimerDock {
  protected timers = inject(TimersService);
  protected open = signal(false);
  protected draft = signal<Record<number, string>>({});
  protected bad = signal<number | null>(null);
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

  protected setDraft(slot: number, v: string): void {
    this.draft.update((d) => ({ ...d, [slot]: v }));
    if (this.bad() === slot) this.bad.set(null);
  }

  protected async start(slot: number): Promise<void> {
    const ms = parseDuration(this.draft()[slot] ?? '');
    if (ms === null) {
      this.bad.set(slot);
      return;
    }
    this.draft.set({});
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
