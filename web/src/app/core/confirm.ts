import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  text: string;
  /** Translation key of the button that does it ("Delete", "Discard changes"). */
  action: string;
  resolve: (yes: boolean) => void;
}

/** Asks before something that cannot be undone, in a bottom sheet (shared/confirm-sheet.ts) instead of confirm(). */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly request = signal<ConfirmRequest | null>(null);

  ask(text: string, action = 'common.confirm'): Promise<boolean> {
    this.request()?.resolve(false);
    return new Promise((resolve) => this.request.set({ text, action, resolve }));
  }
}
