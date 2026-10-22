import { Injectable, signal } from '@angular/core';
import { Side } from '../shared/timer-assist';

const KEY = 'calderone.timer.side';

/** Which screen edge carries the timer tab: a per-device choice (it follows the hand that holds the phone). */
@Injectable({ providedIn: 'root' })
export class TimerSide {
  readonly side = signal<Side>(read());

  set(s: Side): void {
    this.side.set(s);
    try {
      localStorage.setItem(KEY, s);
    } catch {
      /* private mode: until the page is closed */
    }
  }
}

function read(): Side {
  try {
    return localStorage.getItem(KEY) === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
}
