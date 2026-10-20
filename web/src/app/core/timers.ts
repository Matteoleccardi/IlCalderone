import { Injectable, computed, inject, signal } from '@angular/core';
import { I18n } from './i18n';

/** A kitchen timer. Running: `end` is set (epoch ms). Paused: `end` is null and `left` holds the time left. */
export interface KitchenTimer {
  id: number;
  /** Total length in ms. */
  dur: number;
  end: number | null;
  left: number;
  /** Already rang (so a reload or another tab doesn't ring it again). */
  rung?: boolean;
}

export const MAX_TIMERS = 5;
const COOKIE = 'calderone_timers';

/** 754 000 ms → "12:34", 3 723 000 → "1:02:03". Rounded up, so it shows 0:00 only when time is up. */
export function formatLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * Up to 5 kitchen timers shared by every page. They are kept in a cookie (end times, not counters), so they survive
 * a reload and are seen by other tabs. When one ends: a system notification (if allowed), a beep and a vibration.
 */
@Injectable({ providedIn: 'root' })
export class TimersService {
  private i18n = inject(I18n);
  readonly timers = signal<KitchenTimer[]>([]);
  /** Ticks every second while a timer runs, to refresh the displayed times. */
  readonly now = signal(Date.now());
  readonly ringing = computed(() => this.timers().filter((t) => this.isDone(t)));
  readonly running = computed(() => this.timers().filter((t) => t.end !== null && !this.isDone(t)));
  /** 'granted' | 'denied' | 'default', or 'unsupported' (no Notification API, e.g. plain http on a phone). */
  readonly permission = signal<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' || !window.isSecureContext ? 'unsupported' : Notification.permission,
  );

  private tick?: ReturnType<typeof setInterval>;
  private alarm?: ReturnType<typeof setTimeout>;
  private beeper?: ReturnType<typeof setInterval>;
  private audio?: AudioContext;
  private sw?: Promise<ServiceWorkerRegistration | undefined>;

  constructor() {
    this.timers.set(this.readCookie());
    this.schedule();
    // another tab may have changed them
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.timers.set(this.readCookie());
        this.schedule();
      }
    });
    if (this.permission() !== 'unsupported' && 'serviceWorker' in navigator) {
      // needed for notifications on Android (new Notification() is not allowed there)
      this.sw = navigator.serviceWorker.register('sw.js').then(
        () => navigator.serviceWorker.ready,
        () => undefined,
      );
    }
  }

  left(t: KitchenTimer): number {
    return t.end === null ? t.left : t.end - this.now();
  }

  isDone(t: KitchenTimer): boolean {
    return t.end !== null && t.end <= this.now();
  }

  /** Adds and starts a timer. Call from a click: it also asks for the notification permission and unlocks sound. */
  async add(dur: number): Promise<void> {
    if (this.timers().length >= MAX_TIMERS) return;
    this.unlockAudio();
    const id = Math.max(0, ...this.timers().map((t) => t.id)) + 1;
    this.save([...this.timers(), { id, dur, end: Date.now() + dur, left: dur }]);
    await this.askPermission();
  }

  async askPermission(): Promise<void> {
    if (this.permission() !== 'default') return;
    try {
      this.permission.set(await Notification.requestPermission());
    } catch {
      /* old browsers: leave it */
    }
  }

  toggle(id: number): void {
    this.unlockAudio();
    const now = Date.now();
    this.save(
      this.timers().map((t) =>
        t.id !== id || this.isDone(t)
          ? t
          : t.end === null
            ? { ...t, end: now + t.left }
            : { ...t, end: null, left: Math.max(0, t.end - now) },
      ),
    );
  }

  /** Starts a finished timer again with the same length. */
  restart(id: number): void {
    this.save(this.timers().map((t) => (t.id === id ? { id, dur: t.dur, end: Date.now() + t.dur, left: t.dur } : t)));
  }

  remove(id: number): void {
    this.save(this.timers().filter((t) => t.id !== id));
  }

  private save(list: KitchenTimer[]): void {
    this.timers.set(list);
    this.now.set(Date.now());
    this.writeCookie(list);
    this.schedule();
  }

  /** Keeps the 1-second tick, the alarm, the ringing and the beeping in line with the current timers. */
  private schedule(): void {
    if (this.running().length && !this.tick) this.tick = setInterval(this.update, 1000);
    // a single timeout at the next end: background tabs slow down the 1-second tick, not this
    clearTimeout(this.alarm);
    const next = Math.min(...this.running().map((t) => t.end ?? Infinity));
    if (Number.isFinite(next)) this.alarm = setTimeout(this.update, Math.max(0, next - Date.now()) + 50);
    this.update();
  }

  private update = (): void => {
    this.now.set(Date.now());
    const fresh = this.timers().filter((t) => this.isDone(t) && !t.rung);
    if (fresh.length) {
      const ids = new Set(fresh.map((t) => t.id));
      const list = this.timers().map((t) => (ids.has(t.id) ? { ...t, rung: true } : t));
      this.timers.set(list);
      this.writeCookie(list);
      fresh.forEach((t) => this.notify(t));
      this.schedule(); // the next alarm
      return;
    }
    if (!this.running().length && this.tick) {
      clearInterval(this.tick);
      this.tick = undefined;
    }
    this.updateBeeper();
  };

  private notify(t: KitchenTimer): void {
    const title = this.i18n.t('timer.done_title');
    const body = this.i18n.t('timer.done_body', { time: formatLeft(t.dur) });
    navigator.vibrate?.([300, 150, 300, 150, 600]);
    if (this.permission() !== 'granted' || document.visibilityState === 'visible') return; // on screen: the beep says it
    const opts: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
      body,
      tag: `calderone-timer-${t.id}`,
      icon: 'favicon.svg',
      requireInteraction: true,
      vibrate: [300, 150, 300, 150, 600],
      renotify: true,
    };
    const fallback = () => {
      try {
        new Notification(title, opts);
      } catch {
        /* no notification possible: the beep and the dock still show it */
      }
    };
    if (this.sw) this.sw.then((reg) => (reg ? reg.showNotification(title, opts) : fallback()), fallback);
    else fallback();
  }

  /** Beeps every 2 s while a finished timer is not dismissed (for at most 2 minutes after it ended). */
  private updateBeeper(): void {
    const loud = this.ringing().some((t) => this.now() - (t.end ?? 0) < 120_000);
    if (loud && !this.beeper) {
      this.beep();
      this.beeper = setInterval(() => {
        this.now.set(Date.now());
        if (this.ringing().some((t) => this.now() - (t.end ?? 0) < 120_000)) this.beep();
        else this.updateBeeper();
      }, 2000);
    } else if (!loud && this.beeper) {
      clearInterval(this.beeper);
      this.beeper = undefined;
    }
  }

  /** Browsers allow sound only after a tap: create the audio context while handling one. */
  private unlockAudio(): void {
    try {
      this.audio ??= new AudioContext();
      if (this.audio.state === 'suspended') void this.audio.resume();
    } catch {
      /* no Web Audio */
    }
  }

  private beep(): void {
    const ctx = this.audio;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = i === 2 ? 1175 : 880;
      const s = t0 + i * 0.22;
      gain.gain.setValueAtTime(0.0001, s);
      gain.gain.exponentialRampToValueAtTime(0.25, s + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, s + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(s);
      osc.stop(s + 0.2);
    }
  }

  private readCookie(): KitchenTimer[] {
    const raw = document.cookie
      .split('; ')
      .find((c) => c.startsWith(COOKIE + '='))
      ?.slice(COOKIE.length + 1);
    if (!raw) return [];
    try {
      const list = JSON.parse(decodeURIComponent(raw));
      return (Array.isArray(list) ? list : [])
        .filter(
          (t): t is KitchenTimer =>
            !!t && typeof t.id === 'number' && typeof t.dur === 'number' && typeof t.left === 'number' &&
            (t.end === null || typeof t.end === 'number'),
        )
        .slice(0, MAX_TIMERS);
    } catch {
      return [];
    }
  }

  private writeCookie(list: KitchenTimer[]): void {
    const path = new URL(document.baseURI).pathname || '/';
    const value = encodeURIComponent(JSON.stringify(list));
    const age = list.length ? 2 * 24 * 3600 : 0; // forgotten timers go away after two days
    document.cookie = `${COOKIE}=${value}; path=${path}; max-age=${age}; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
  }
}
