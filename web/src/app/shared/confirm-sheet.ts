import { Component, ElementRef, effect, inject, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { ConfirmService } from '../core/confirm';
import { TPipe } from '../core/i18n';

/** The one confirmation sheet of the app (mounted in app.html); see ConfirmService. */
@Component({
  selector: 'app-confirm-sheet',
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <dialog class="sheet confirm" #dlg aria-labelledby="confirm-text" (close)="closed()" (click)="$event.target === dlg && dlg.close()">
      @if (confirm.request(); as r) {
        <p id="confirm-text" class="confirm-text">{{ r.text }}</p>
        <div class="actions">
          <button type="button" class="danger-fill" (click)="answer(true)">{{ r.action | t }}</button>
          <button type="button" (click)="answer(false)">{{ 'common.cancel' | t }}</button>
        </div>
      }
    </dialog>
  `,
})
export class ConfirmSheet {
  protected confirm = inject(ConfirmService);
  private dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const d = this.dlg().nativeElement;
      if (this.confirm.request() && !d.open) d.showModal();
    });
  }

  protected answer(yes: boolean): void {
    this.confirm.request()?.resolve(yes);
    this.confirm.request.set(null);
    this.dlg().nativeElement.close();
  }

  /** Closed by Escape or a tap outside: that is a "no". */
  protected closed(): void {
    this.confirm.request()?.resolve(false);
    this.confirm.request.set(null);
  }
}
