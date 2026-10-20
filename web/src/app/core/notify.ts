import { Injectable, inject, signal } from '@angular/core';
import { ApiError } from './api';
import { AppError, I18n } from './i18n';

export interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}

/** Small toast messages shown by the shell (top-right). */
@Injectable({ providedIn: 'root' })
export class Notify {
  readonly toasts = signal<Toast[]>([]);
  private next = 1;
  private i18n = inject(I18n);

  /** A success message: a translation key (with params) or an already translated text. Older errors go away. */
  ok(key: string, params?: Record<string, unknown>): void {
    this.toasts.update((t) => t.filter((x) => x.kind !== 'error'));
    this.push(this.i18n.t(key, params), 'ok');
  }

  error(e: unknown): void {
    this.push(this.message(e), 'error');
  }

  message(e: unknown): string {
    if (e instanceof ApiError) return this.i18n.error(e.code, e.params, e.message);
    if (e instanceof AppError) return this.i18n.t(e.key, e.params);
    if (e instanceof Error) return e.message;
    return this.i18n.t(String(e));
  }

  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }

  private push(text: string, kind: Toast['kind']): void {
    const id = this.next++;
    this.toasts.update((t) => [...t, { id, text, kind }]);
    setTimeout(() => this.dismiss(id), kind === 'error' ? 7000 : 3500);
  }
}
