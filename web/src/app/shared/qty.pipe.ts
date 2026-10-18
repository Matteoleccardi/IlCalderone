import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18n } from '../core/i18n';
import { fmtQty } from '../core/text-formats';

/** A quantity for display: 0.333 → "0,33" (decimal separator of the interface language). */
@Pipe({ name: 'qty' })
export class QtyPipe implements PipeTransform {
  private i18n = inject(I18n);

  transform(qty: number | null): string {
    return fmtQty(qty, this.i18n.lang);
  }
}

/** A unit for display: the stored "q.b." (to taste) is translated, every other unit is shown as written. */
@Pipe({ name: 'unit' })
export class UnitPipe implements PipeTransform {
  private i18n = inject(I18n);

  transform(unit: string): string {
    return unit === 'q.b.' ? this.i18n.t('qty.qb') : unit;
  }
}
