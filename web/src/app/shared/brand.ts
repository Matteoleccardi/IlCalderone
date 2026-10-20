import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { pickLogo, weekIndex } from '../core/logo';
import { ThemeService } from '../core/theme';

interface Logos {
  light: string[];
  dark: string[];
  /** Logos that suit any theme: they join both lists. */
  medium?: string[];
}

/**
 * The site title in the top bar: this week's logo for the current theme, from public/logos/ (listed in
 * logos/logos.json by scripts/logos.mjs). Dark themes take a light logo (logos/light/), light themes a dark one
 * (logos/dark/); logos/medium/ suit both and join either list. Without images, or if one fails to load, it shows the text title. The box has a fixed height.
 */
@Component({
  selector: 'app-brand',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (src(); as s) {
      <img class="brand-img" [src]="s" alt="Il Calderone" (error)="failed.set(s)" />
    } @else {
      <span class="logo" aria-hidden="true">🍲</span> Il Calderone
    }
  `,
  host: { class: 'brand-box' },
})
export class Brand {
  private theme = inject(ThemeService);
  private logos = signal<Logos | null>(null);
  protected failed = signal<string | null>(null);
  private week = weekIndex();

  /** This week's image for the current theme, or null for the text title. */
  readonly src = computed<string | null>(() => {
    const l = this.logos();
    if (!l) return null;
    const pool = [...(this.theme.activeKind() === 'dark' ? l.light : l.dark), ...(l.medium ?? [])];
    const file = pickLogo(pool, this.week);
    if (!file) return null;
    const url = 'logos/' + file.split('/').map(encodeURIComponent).join('/');
    return url === this.failed() ? null : url;
  });

  constructor() {
    fetch('logos/logos.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((l: Logos | null) => {
        if (l && Array.isArray(l.light) && Array.isArray(l.dark)) this.logos.set(l);
      })
      .catch(() => {
        /* no logos: text title */
      });
  }
}
