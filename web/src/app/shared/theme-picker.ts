import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { THEMES } from '../../themes/themes';
import { TPipe } from '../core/i18n';
import { ThemeMode, ThemeService } from '../core/theme';

/**
 * Appearance settings: follow the phone (auto) or force light/dark, and the favourite light and dark theme.
 * Each choice is a small live preview: the button carries data-theme, so it shows that theme's own colours.
 */
@Component({
  selector: 'app-theme-picker',
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="segmented theme-mode" role="group" [attr.aria-label]="'theme.mode' | t">
      @for (m of modes; track m) {
        <button type="button" [class.on]="theme.pref().mode === m" [attr.aria-pressed]="theme.pref().mode === m" (click)="theme.set({ mode: m })">
          {{ modeLabel[m] | t }}
        </button>
      }
    </div>
    <p class="muted small">{{ modeHint[theme.pref().mode] | t }}</p>

    @for (kind of kinds; track kind) {
      <h3>{{ (kind === 'light' ? 'theme.light' : 'theme.dark') | t }}</h3>
      <div class="theme-grid">
        @for (t of list(kind); track t.id) {
          <button
            type="button"
            class="theme-card"
            [attr.data-theme]="t.id"
            [class.on]="theme.pref()[kind] === t.id"
            [attr.aria-pressed]="theme.pref()[kind] === t.id"
            (click)="choose(kind, t.id)"
          >
            <span class="theme-sample" aria-hidden="true">
              <span class="theme-sample-card">
                <span class="theme-sample-line"></span>
                <span class="theme-sample-line short"></span>
                <span class="theme-sample-pill"></span>
              </span>
            </span>
            <span class="theme-name">{{ t.name }}</span>
            @if (t.name !== t.pack) {
              <span class="theme-pack">{{ t.pack }}</span>
            }
            @if (theme.active() === t.id) {
              <span class="theme-now">{{ 'theme.now' | t }}</span>
            }
          </button>
        }
      </div>
    }
  `,
})
export class ThemePicker {
  protected theme = inject(ThemeService);
  protected modes: ThemeMode[] = ['auto', 'light', 'dark'];
  protected modeLabel: Record<ThemeMode, string> = { auto: 'theme.mode_auto', light: 'theme.mode_light', dark: 'theme.mode_dark' };
  protected modeHint: Record<ThemeMode, string> = {
    auto: 'theme.mode_hint_auto',
    light: 'theme.mode_hint_light',
    dark: 'theme.mode_hint_dark',
  };
  protected kinds = ['light', 'dark'] as const;
  protected list = (kind: 'light' | 'dark') => THEMES.filter((t) => t.kind === kind);

  protected choose(kind: 'light' | 'dark', id: string): void {
    void this.theme.set(kind === 'light' ? { light: id } : { dark: id });
  }
}
