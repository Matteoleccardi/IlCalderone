import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
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
