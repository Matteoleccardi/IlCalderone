import { Component, input, ChangeDetectionStrategy } from '@angular/core';

/**
 * The line icons of the bottom navigation (24×24, stroke = currentColor, so they take the accent colour).
 * The gear follows Lucide's "settings" icon (ISC licence); the others are drawn for Il Calderone.
 */
@Component({
  selector: 'app-nav-icon',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @switch (name()) {
        @case ('/ricette') {
          <!-- cauldron: round pot with a rim, short feet and steam -->
          <path d="M9.5 6.2c-.6-.8.6-1.4 0-2.4M12.5 6.2c-.6-.8.6-1.4 0-2.4M15.5 6.2c-.6-.8.6-1.4 0-2.4" />
          <rect x="3" y="8" width="18" height="2.6" rx="1.3" />
          <path d="M4.6 10.6C4.2 11.5 4 12.5 4 13.5c0 3.6 3.6 6.5 8 6.5s8-2.9 8-6.5c0-1-.2-2-.6-2.9" />
          <path d="M8.2 19.4 7.6 21M15.8 19.4l.6 1.6" />
        }
        @case ('/menu') {
          <!-- calendar -->
          <rect x="3" y="5" width="18" height="16" rx="2.5" />
          <path d="M3 10h18M8 3v4M16 3v4" />
          <path d="M7.5 14h2M11 14h2M14.5 14h2M7.5 17.5h2M11 17.5h2" />
        }
        @case ('/raccolte') {
          <!-- star -->
          <path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 9.6l6-.9z" />
        }
        @case ('timer') {
          <!-- stopwatch -->
          <circle cx="12" cy="13.5" r="7.5" />
          <path d="M12 9.5v4l2.5 1.5M9.5 3h5M12 3v3" />
        }
        @case ('/account') {
          <!-- person -->
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4.5 20.5v-1A5.5 5.5 0 0 1 10 14h4a5.5 5.5 0 0 1 5.5 5.5v1" />
        }
        @case ('/spesa') {
          <!-- bullet list -->
          <path d="M9.5 6h11M9.5 12h11M9.5 18h11" />
          <circle cx="4.75" cy="6" r="1.1" fill="currentColor" />
          <circle cx="4.75" cy="12" r="1.1" fill="currentColor" />
          <circle cx="4.75" cy="18" r="1.1" fill="currentColor" />
        }
        @case ('/diario') {
          <!-- open book -->
          <path d="M12 7.5v12.5" />
          <path d="M2.5 5h6a3.5 3.5 0 0 1 3.5 3.5A3.5 3.5 0 0 1 15.5 5h6v13.5h-6.5A3 3 0 0 0 12 20a3 3 0 0 0-3-1.5H2.5z" />
        }
        @case ('/famiglie') {
          <!-- a small family: two adults and a child -->
          <circle cx="7" cy="6.5" r="2.5" />
          <circle cx="17" cy="6.5" r="2.5" />
          <circle cx="12" cy="11.5" r="2" />
          <path d="M2.5 19.5v-2.5A4.5 4.5 0 0 1 7 12.5c.8 0 1.5.2 2.1.5M21.5 19.5v-2.5A4.5 4.5 0 0 0 17 12.5c-.8 0-1.5.2-2.1.5" />
          <path d="M8.5 20.5v-1a3.5 3.5 0 0 1 7 0v1" />
        }
        @case ('/admin') {
          <!-- gear -->
          <path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
          />
          <circle cx="12" cy="12" r="3" />
        }
        @default {
          <circle cx="12" cy="12" r="8" />
        }
      }
    </svg>
  `,
})
export class NavIcon {
  /** The page path the icon stands for. */
  readonly name = input.required<string>();
}
