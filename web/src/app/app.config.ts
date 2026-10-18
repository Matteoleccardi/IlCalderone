import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { FEATURES } from './core/features';
import { sessionExpiredInterceptor } from './core/http-errors';
import { I18n, isLang } from './core/i18n';
import { SessionService } from './core/session';
import { AppTitle } from './core/title';
import { ALL_FEATURES } from './features.registry';

/** Before the first render: who is logged in, and in which language to show the interface. */
async function startUp(): Promise<void> {
  const i18n = inject(I18n);
  const session = inject(SessionService);
  let lang = i18n.preferred();
  try {
    const s = await session.ensure();
    if (isLang(s.user?.lang)) lang = s.user.lang;
  } catch {
    // server unreachable: the pages will show the error
  }
  await i18n.load(lang);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
      withInterceptors([sessionExpiredInterceptor]),
    ),
    provideAppInitializer(startUp),
    { provide: FEATURES, useValue: ALL_FEATURES },
    AppTitle,
    { provide: TitleStrategy, useExisting: AppTitle },
  ],
};
