/** The invisible band along the screen edge that helps a thumb find the timer tab (docs/design.md, "Timer tab"). */
export const BAND_PX = 24;
/** How long the tab stays big after the last touch in the band. */
export const HOLD_MS = 1500;

export type Side = 'left' | 'right';

export interface AssistState {
  /** The tab is bigger (a touch landed in the band). */
  enlarged: boolean;
  /** A second touch missed the tab too: its tappable area is stretched further. */
  help: boolean;
}

/** Is a touch at x (px) within the band of the chosen edge? */
export function inBand(x: number, viewportWidth: number, side: Side): boolean {
  return side === 'right' ? x >= viewportWidth - BAND_PX : x <= BAND_PX;
}

/**
 * Nudge, then help: the first touch in the band makes the tab bigger; if the next touch (while it is big) misses it
 * again, its tappable area grows too. Everything goes back to normal HOLD_MS after the last touch.
 */
export class Assist {
  state: AssistState = { enlarged: false, help: false };
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private onChange: (s: AssistState) => void) {}

  /** A touch in the band; onTab = it landed on the tab itself. */
  touch(onTab: boolean): void {
    if (!this.state.enlarged) this.set({ enlarged: true, help: false });
    else if (!onTab && !this.state.help) this.set({ enlarged: true, help: true });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reset(), HOLD_MS);
  }

  reset(): void {
    clearTimeout(this.timer);
    if (this.state.enlarged || this.state.help) this.set({ enlarged: false, help: false });
  }

  private set(s: AssistState): void {
    this.state = s;
    this.onChange(s);
  }
}
