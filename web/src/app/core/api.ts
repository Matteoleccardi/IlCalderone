import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Error raised by Api calls. The server sends {error: English text, code, params}; Notify shows the translation of
 * "err.<code>" (see i18n), falling back to the English text.
 */
export class ApiError extends Error {
  constructor(public status: number, public code: string, public params: Record<string, unknown>, message: string) {
    super(message);
  }
}

/**
 * Thin promise-based wrapper around HttpClient for the PHP API.
 * URLs are relative ("api/...") so the app works at the domain root or in a sub-folder (see <base href>).
 * CSRF: HttpClient automatically copies the XSRF-TOKEN cookie into the X-XSRF-TOKEN header.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== '') p = p.set(k, String(v));
    }
    return this.run(this.http.get<T>(this.url(path), { params: p }));
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.run(this.http.post<T>(this.url(path), body));
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.run(this.http.put<T>(this.url(path), body));
  }

  delete<T>(path: string): Promise<T> {
    return this.run(this.http.delete<T>(this.url(path)));
  }

  url(path: string): string {
    return 'api/' + path.replace(/^\/+/, '');
  }

  photoUrl(recipeId: string, version?: string): string {
    return this.url(`recipes/${recipeId}/photo`) + (version ? `?v=${encodeURIComponent(version)}` : '');
  }

  modelUrl(recipeId: string, version?: string): string {
    return this.url(`recipes/${recipeId}/model`) + (version ? `?v=${encodeURIComponent(version)}` : '');
  }

  iconUrl(recipeId: string, version?: string): string {
    return this.url(`recipes/${recipeId}/icon`) + (version ? `?v=${encodeURIComponent(version)}` : '');
  }

  private async run<T>(obs: import('rxjs').Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(obs);
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        const body = e.error && typeof e.error === 'object' ? (e.error as Record<string, unknown>) : null;
        if (body && typeof body['code'] === 'string') {
          throw new ApiError(e.status, body['code'], (body['params'] as Record<string, unknown>) ?? {}, String(body['error'] ?? ''));
        }
        throw new ApiError(e.status, e.status === 0 ? 'offline' : 'http', { status: e.status }, `HTTP ${e.status}`);
      }
      throw e;
    }
  }
}
