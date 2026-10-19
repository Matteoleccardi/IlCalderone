import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { TPipe } from '../core/i18n';
import { Visibility } from '../core/models';

@Component({
  selector: 'app-visibility',
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<span [class]="'badge ' + value()" [title]="'visibility.' + value() + '_title' | t">{{
    'visibility.' + value() | t
  }}</span>`,
})
export class VisibilityBadge {
  readonly value = input.required<Visibility>();
}
