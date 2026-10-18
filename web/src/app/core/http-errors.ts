import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SessionService } from './session';

/** A 401 from any call other than session/login means the session expired: go back to the login page. */
export const sessionExpiredInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const session = inject(SessionService);
  return next(req).pipe(
    catchError((e: unknown) => {
      if (e instanceof HttpErrorResponse && e.status === 401 && !/api\/(session|login|setup)$/.test(req.url)) {
        session.state.update((s) => (s ? { ...s, user: null } : s));
        router.navigate(['/login'], { queryParams: { next: router.url } });
      }
      return throwError(() => e);
    }),
  );
};
