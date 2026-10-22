import { Injectable, computed, inject } from '@angular/core';
import { FEATURES } from './features';
import { SessionService } from './session';

/** The navigation entries of the enabled features (+ the admin ones for admins), for the bottom tabs and the account page. */
@Injectable({ providedIn: 'root' })
export class NavService {
  private features = inject(FEATURES);
  private session = inject(SessionService);

  readonly items = computed(() => {
    const user = this.session.user();
    const mods = this.session.modules();
    return this.features
      .filter((f) => !f.module || mods.has(f.module))
      .flatMap((f) => f.nav ?? [])
      .filter((n) => !n.admin || user?.admin);
  });
}
