import { Component, input, ChangeDetectionStrategy } from '@angular/core';

/** The JSON file an item is stored in (e.g. "05abc….json"), in small gray text; the folder is in the tooltip. */
@Component({
  selector: 'app-file-name',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<p class="file-name" [title]="'data/' + folder() + '/' + id() + '.json'">{{ id() }}.json</p>`,
})
export class FileName {
  readonly id = input.required<string>();
  /** Folder under data/: recipes, menus, collections. */
  readonly folder = input.required<string>();
}
