import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, CanMatchFn, Router } from '@angular/router';
import { ConfirmService } from './confirm';
import { I18n } from './i18n';
import { SessionService } from './session';

/** Everything needs a login (the site may be public on the internet). First run → /setup. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const s = await session.ensure();
  if (s.needs_setup) return router.parseUrl('/setup');
  if (!s.user) return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  return true;
};

export const adminGuard: CanActivateFn = async () => {
  const s = await inject(SessionService).ensure();
  return !!s.user?.admin || inject(Router).parseUrl('/');
};

/** Lazy feature routes only match when the matching PHP module is enabled. */
export const moduleEnabled = (module: string): CanMatchFn => async () => {
  const s = await inject(SessionService).ensure();
  return s.modules.includes(module);
};

/** A page whose edits would be lost by leaving it (the recipe form, the menu editor). */
export interface HasUnsaved {
  hasUnsaved(): boolean;
}

/** Leaving is fine when nothing is unsaved, or when the user agrees to lose it. */
export function mayLeave(page: HasUnsaved, ask: () => boolean | Promise<boolean>): boolean | Promise<boolean> {
  return !page.hasUnsaved() || ask();
}

export const unsavedGuard: CanDeactivateFn<HasUnsaved> = (page) => {
  const i18n = inject(I18n);
  const confirmer = inject(ConfirmService);
  return mayLeave(page, () => confirmer.ask(i18n.t('common.unsaved_confirm'), 'common.discard'));
};
