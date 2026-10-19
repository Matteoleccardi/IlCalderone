import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { I18n, TPipe } from '../../core/i18n';
import { Visibility } from '../../core/models';
import { Notify } from '../../core/notify';
import { ScopePicker } from '../../shared/scope-picker';

interface ImportResult {
  created: string[];
  messages: { code: string; params: Record<string, unknown> }[];
}

@Component({
  selector: 'app-recipe-import',
  imports: [FormsModule, RouterLink, ScopePicker, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>{{ 'import.title' | t }}</h1>
    <section class="card">
      <h2>{{ 'import.import' | t }}</h2>
      <p>{{ 'import.intro' | t }}</p>
      <label
        >{{ 'import.file' | t }}
        <input type="file" accept=".json,application/json" multiple (change)="pick($event)"
      /></label>
      @if (items().length) {
        <p>{{ 'import.ready' | t: { n: items().length } }} {{ titles() }}</p>
        <app-scope-picker [(visibility)]="visibility" [(household)]="household" />
        <button type="button" class="primary" (click)="run()" [disabled]="busy()">
          {{ 'import.run' | t }}
        </button>
      }
      @if (result(); as res) {
        <p class="ok">{{ 'import.done' | t: { n: res.created.length } }}</p>
        @if (res.messages.length) {
          <ul class="small">
            @for (m of res.messages; track $index) {
              <li>{{ i18n.error(m.code, m.params) }}</li>
            }
          </ul>
        }
        <p>
          <a routerLink="/ricette">{{ 'import.go' | t }} →</a>
        </p>
      }
    </section>
    <section class="card">
      <h2>{{ 'import.export' | t }}</h2>
      <p>{{ 'import.export_intro' | t }}</p>
      <p class="actions">
        <a class="button" [href]="api.url('recipes/export?scope=mine')" download>{{
          'import.export_mine' | t
        }}</a>
        <a class="button" [href]="api.url('recipes/export?scope=visible')" download>{{
          'import.export_visible' | t
        }}</a>
        <a class="button" [href]="api.url('recipes/export?scope=mine&photos=0')" download>{{
          'import.export_nophotos' | t
        }}</a>
      </p>
    </section>
  `,
})
export class RecipeImport {
  protected api = inject(Api);
  protected i18n = inject(I18n);
  private notify = inject(Notify);
  protected items = signal<Record<string, unknown>[]>([]);
  protected result = signal<ImportResult | null>(null);
  protected busy = signal(false);
  protected visibility = signal<Visibility>('shared');
  protected household = signal<string | null>(null);

  protected titles = () =>
    this.items()
      .slice(0, 8)
      .map((i) => String(i['title'] ?? '?'))
      .join(', ') + (this.items().length > 8 ? '…' : '');

  async pick(ev: Event): Promise<void> {
    const files = Array.from((ev.target as HTMLInputElement).files ?? []);
    const all: Record<string, unknown>[] = [];
    for (const f of files) {
      try {
        const data = JSON.parse(await f.text());
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.recipes)
            ? data.recipes
            : [data];
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
      this.result.set(
        await this.api.post<ImportResult>('recipes/import', {
          recipes: this.items(),
          visibility: this.visibility(),
          household: this.household(),
        }),
      );
      this.items.set([]);
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
