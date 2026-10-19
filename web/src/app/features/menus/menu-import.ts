import { Component, inject, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { Api } from '../../core/api';
import { I18n, TPipe } from '../../core/i18n';
import { Visibility } from '../../core/models';
import { Notify } from '../../core/notify';
import { ScopePicker } from '../../shared/scope-picker';

interface ImportResult {
  created: string[];
  messages: { code: string; params: Record<string, unknown> }[];
}

/** Import menus from a calderone-menu/1 JSON file (e.g. one made by the menu-planner agent) and export them. */
@Component({
  selector: 'app-menu-import',
  imports: [ScopePicker, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="card narrow">
      <h2>{{ 'menuio.title' | t }}</h2>
      <p class="small">{{ 'menuio.intro' | t }}</p>
      <label
        >{{ 'import.file' | t }}
        <input type="file" accept=".json,application/json" multiple (change)="pick($event)"
      /></label>
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
  private notify = inject(Notify);
  /** Emitted after an import that created menus, so the list can reload. */
  readonly imported = output<void>();
  protected items = signal<Record<string, unknown>[]>([]);
  protected result = signal<ImportResult | null>(null);
  protected busy = signal(false);
  protected visibility = signal<Visibility>('private');
  protected household = signal<string | null>(null);

  protected names = () =>
    this.items()
      .slice(0, 8)
      .map((i) => `${String(i['name'] ?? '?')} (${this.i18n.t('menus.weeks', { n: Number(i['weeks'] ?? 1) })})`)
      .join(', ') + (this.items().length > 8 ? '…' : '');

  async pick(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // so picking the same file again still works
    const all: Record<string, unknown>[] = [];
    for (const f of files) {
      try {
        const data = JSON.parse(await f.text());
        const list = Array.isArray(data) ? data : Array.isArray(data?.menus) ? data.menus : [data];
        all.push(...list.filter((x: unknown) => x && typeof x === 'object'));
      } catch {
        this.notify.error(this.i18n.t('import.bad_file', { name: f.name }));
      }
    }
    this.items.set(all);
    this.result.set(null);
  }

  async run(): Promise<void> {
    this.busy.set(true);
    try {
      const res = await this.api.post<ImportResult>('menus/import', {
        menus: this.items(),
        visibility: this.visibility(),
        household: this.household(),
      });
      this.result.set(res);
      this.items.set([]);
      if (res.created.length) this.imported.emit();
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
