import { Component, OnInit, inject, input, model, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HouseholdsService } from '../core/households';
import { TPipe } from '../core/i18n';
import { Visibility } from '../core/models';

/** "Who can see this?": private / household (+ which one) / shared. Two-way bindable. */
@Component({
  selector: 'app-scope-picker',
  imports: [FormsModule, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="row">
      <label>
        {{ (allowShared() ? 'scope.who_sees' : 'scope.whose') | t }}
        <select [ngModel]="visibility()" (ngModelChange)="setVisibility($event)" name="visibility">
          @if (allowShared()) {
            <option value="shared">{{ 'scope.shared' | t }}</option>
          }
          <option value="private">{{ 'scope.private' | t }}</option>
          <option value="household" [disabled]="!households.list().length">
            {{ 'scope.household' | t
            }}{{ households.list().length ? '' : ' ' + ('scope.no_household' | t) }}
          </option>
        </select>
        @if (allowShared()) {
          <span class="muted small hint">{{ (visibility() === 'shared' ? 'scope.shared_hint' : 'scope.not_shared_hint') | t }}</span>
        }
      </label>
      @if (visibility() === 'household' && households.list().length > 1) {
        <label>
          {{ 'scope.which_household' | t }}
          <select [ngModel]="household()" (ngModelChange)="household.set($event)" name="household">
            @for (h of households.list(); track h.id) {
              <option [value]="h.id">{{ h.name }}</option>
            }
          </select>
        </label>
      }
    </div>
  `,
})
export class ScopePicker implements OnInit {
  readonly visibility = model<Visibility>('private');
  readonly household = model<string | null>(null);
  /** Menus can only be personal or of a household. */
  readonly allowShared = input(true);
  protected households = inject(HouseholdsService);

  ngOnInit(): void {
    this.households.ensure();
  }

  setVisibility(v: Visibility): void {
    this.visibility.set(v);
    if (v === 'household') {
      if (!this.household()) this.household.set(this.households.list()[0]?.id ?? null);
    } else {
      this.household.set(null);
    }
  }
}
