import { Component, computed, inject, output, signal, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { Api } from '../../core/api';
import { I18n, TPipe } from '../../core/i18n';
import { Visibility } from '../../core/models';
import { SessionService } from '../../core/session';
import { ImportResult, JsonBatch, PickedFile, importInChunks } from '../../shared/json-batch';
import { ScopePicker } from '../../shared/scope-picker';

/** Import menus from a calderone-menu/1 JSON file (e.g. one made by the menu-planner agent) and export them. */
@Component({
  selector: 'app-menu-import',
  imports: [JsonBatch, ScopePicker, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="card narrow">
      <h2>{{ 'menuio.title' | t }}</h2>
      <p class="small">{{ 'menuio.intro' | t }}</p>
      <app-json-batch listKey="menus" [unit]="'batch.menus'" (changed)="files.set($event)" />
      @if (items().length) {
        <p>{{ 'menuio.ready' | t: { n: items().length } }} {{ names() }}</p>
        <app-scope-picker [(visibility)]="visibility" [(household)]="household" [allowShared]="false" />
        <button type="button" class="primary" (click)="run()" [disabled]="busy()">
          {{ 'import.run' | t }}
        </button>
      }
      @if (result(); as res) {
        <p class="ok">{{ 'menuio.done' | t: { n: res.created.length } }}</p>
        @if (res.messages.length) {
          <ul class="small">
            @for (m of res.messages; track $index) {
              <li>{{ i18n.error(m.code, m.params) }}</li>
            }
          </ul>
        }
      }
      <p class="actions">
        <a class="button" [href]="api.url('menus/export')" download>{{ 'menuio.export_all' | t }}</a>
      </p>
    </section>
  `,
})
export class MenuImport {
  protected api = inject(Api);
  protected i18n = inject(I18n);
  private session = inject(SessionService);
  private batch = viewChild(JsonBatch);
  protected files = signal<PickedFile[]>([]);
  /** Emitted after an import that created menus, so the list can reload. */
  readonly imported = output<void>();
  protected items = computed(() => this.files().flatMap((f) => f.items));
  protected result = signal<ImportResult | null>(null);
  protected busy = signal(false);
  protected visibility = signal<Visibility>('private');
  protected household = signal<string | null>(null);

  protected names = () =>
    this.items()
      .slice(0, 8)
      .map((i) => `${String(i['name'] ?? '?')} (${this.i18n.t('menus.weeks', { n: Number(i['weeks'] ?? 1) })})`)
      .join(', ') + (this.items().length > 8 ? '…' : '');

  async run(): Promise<void> {
    this.busy.set(true);
    this.result.set(null);
    try {
      const res = await importInChunks(
        this.api,
        'menus/import',
        'menus',
        this.items(),
        { visibility: this.visibility(), household: this.household() },
        this.session.state()?.max_upload ?? 8 * 1048576,
        () => {},
        (it) => String(it['name'] ?? '?'),
      );
      this.result.set(res);
      this.batch()?.reset();
      if (res.created.length) this.imported.emit();
    } finally {
      this.busy.set(false);
    }
  }
}
