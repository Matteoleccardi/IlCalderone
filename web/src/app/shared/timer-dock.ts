import { Component, computed, effect, inject, ChangeDetectionStrategy } from '@angular/core';
import { TPipe } from '../core/i18n';
import { MAX_TIMERS, TimersService, formatLeft } from '../core/timers';
import { DurationWheel } from './duration-wheel';

/**
 * Kitchen timers on every page: a strip above the bottom tabs, shown while at least one timer exists. Each timer is a
 * 44px chip (tap = pause/resume, the cross removes it); a ringing one says "done" in words and stops on tap.
 * A new timer's length is chosen on wheels (shared/duration-wheel.ts), opened from the strip's "+", the cooking mode
 * or the More sheet (TimersService.picking).
 */
@Component({
  selector: 'app-timer-dock',
  imports: [DurationWheel, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <!-- announces a ringing timer to screen readers (the beep and the pulse are not enough) -->
    <p class="sr-only" role="alert">@if (timers.ringing().length) { {{ 'timer.ringing' | t }} }</p>
    @if (timers.timers().length) {
      <aside class="timer-strip" [class.ringing]="timers.ringing().length > 0" [attr.aria-label]="'timer.title' | t">
        <ul>
          @for (t of timers.timers(); track t.id) {
            @let done = timers.isDone(t);
            <li class="timer-chip" [class.done]="done" [class.paused]="t.end === null">
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
            </li>
          }
        </ul>
        @if (canAdd()) {
          <button type="button" class="timer-add" (click)="timers.picking.set(true)" [attr.aria-label]="'timer.new' | t">
            <span aria-hidden="true">+</span>
          </button>
        }
      </aside>
    }
    @if (timers.picking()) {
      <app-duration-wheel (start)="start($event)" (cancel)="timers.picking.set(false)" />
    }
  `,
})
export class TimerDock {
  protected timers = inject(TimersService);
  protected fmt = formatLeft;
  protected canAdd = computed(() => this.timers.timers().length < MAX_TIMERS);

  constructor() {
    // pages keep room for the strip (see --strip-h in styles.css)
    effect(() => {
      document.documentElement.style.setProperty('--strip-h', this.timers.timers().length ? '3.5rem' : '0px');
    });
  }

  /** Started from the picker: a tap, so it can also unlock sound and ask for notifications. */
  protected async start(ms: number): Promise<void> {
    this.timers.picking.set(false);
    await this.timers.add(ms);
  }
}
