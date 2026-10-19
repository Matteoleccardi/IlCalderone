import { Component, computed, inject, signal, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { I18n, TPipe } from '../../core/i18n';
import { Visibility } from '../../core/models';
import { SessionService } from '../../core/session';
import { ImportResult, Item, JsonBatch, PickedFile, importInChunks } from '../../shared/json-batch';
import { ScopePicker } from '../../shared/scope-picker';

/** Parents before their variants, so a variant in a later chunk finds its parent already imported. */
export function parentsFirst(items: Item[]): Item[] {
  const byId = new Map(items.filter((i) => typeof i['id'] === 'string').map((i) => [i['id'] as string, i]));
  const out: Item[] = [];
  const seen = new Set<Item>();
  const visit = (it: Item, depth: number): void => {
    if (seen.has(it)) return;
    seen.add(it);
    if (depth < 50) {
      for (const p of Array.isArray(it['parents']) ? it['parents'] : []) {
        const parent = byId.get(String((p as Item)?.['id'] ?? ''));
        if (parent) visit(parent, depth + 1);
      }
    }
    out.push(it);
  };
  items.forEach((it) => visit(it, 0));
  return out;
}

@Component({
  selector: 'app-recipe-import',
  imports: [FormsModule, RouterLink, JsonBatch, ScopePicker, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>{{ 'import.title' | t }}</h1>
    <section class="card">
      <h2>{{ 'import.import' | t }}</h2>
      <p>{{ 'import.intro' | t }}</p>
      <p class="small">{{ 'batch.intro' | t }}</p>
      <app-json-batch listKey="recipes" [unit]="'batch.recipes'" (changed)="files.set($event)" />
      @if (items().length) {
        <p>{{ 'import.ready' | t: { n: items().length } }} {{ titles() }}</p>
        <app-scope-picker [(visibility)]="visibility" [(household)]="household" />
        <button type="button" class="primary" (click)="run()" [disabled]="busy()">
          {{ 'import.run' | t }}
        </button>
      }
      @if (busy() && total() > 0) {
        <progress class="batch" [max]="total()" [value]="sent()"></progress>
        <p class="small muted">{{ 'batch.progress' | t: { done: sent(), total: total() } }}</p>
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
  private session = inject(SessionService);
  private batch = viewChild(JsonBatch);
  protected files = signal<PickedFile[]>([]);
  protected items = computed(() => this.files().flatMap((f) => f.items));
  protected sent = signal(0);
  protected total = signal(0);
  protected result = signal<ImportResult | null>(null);
  protected busy = signal(false);
  protected visibility = signal<Visibility>('shared');
  protected household = signal<string | null>(null);

  protected titles = () =>
    this.items()
      .slice(0, 8)
      .map((i) => String(i['title'] ?? '?'))
      .join(', ') + (this.items().length > 8 ? '…' : '');

  async run(): Promise<void> {
    this.busy.set(true);
    this.result.set(null);
    try {
      const max = this.session.state()?.max_upload ?? 8 * 1048576;
      this.result.set(
        await importInChunks(
          this.api,
          'recipes/import',
          'recipes',
          parentsFirst(this.items()),
          { visibility: this.visibility(), household: this.household() },
          max,
          (done, total) => {
            this.sent.set(done);
            this.total.set(total);
          },
          (it) => String(it['title'] ?? '?'),
        ),
      );
      this.batch()?.reset();
    } finally {
      this.busy.set(false);
      this.total.set(0);
    }
  }
}
