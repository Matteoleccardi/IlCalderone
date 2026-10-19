import { Component, computed, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { Api, ApiError } from '../core/api';
import { TPipe } from '../core/i18n';

export type Item = Record<string, unknown>;

/** One picked file: its items, or `error` when it is not JSON / has no items. */
export interface PickedFile {
  name: string;
  size: number;
  items: Item[];
  error: boolean;
}

/** Bytes of a value once sent as JSON. */
export function jsonSize(v: unknown): number {
  return new Blob([JSON.stringify(v)]).size;
}

/**
 * Splits items into chunks whose JSON stays under `maxBytes` (and at most `maxItems` each), keeping their order.
 * An item that alone is over the limit is returned in `tooBig` and not sent.
 */
export function chunkBySize(items: Item[], maxBytes: number, maxItems = 40): { chunks: Item[][]; tooBig: Item[] } {
  const chunks: Item[][] = [];
  const tooBig: Item[] = [];
  let cur: Item[] = [];
  let size = 0;
  for (const it of items) {
    const s = jsonSize(it) + 1;
    if (s > maxBytes) {
      tooBig.push(it);
      continue;
    }
    if (cur.length && (size + s > maxBytes || cur.length >= maxItems)) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(it);
    size += s;
  }
  if (cur.length) chunks.push(cur);
  return { chunks, tooBig };
}

export interface ImportMessage {
  code: string;
  params: Record<string, unknown>;
}

export interface ImportResult {
  created: string[];
  messages: ImportMessage[];
}

/**
 * Sends `items` to an import route (`{[key]: chunk, ...extra}`) in chunks that fit the server's upload limit, one
 * after the other, and merges the results. A chunk that fails is reported and the next ones are still sent.
 */
export async function importInChunks(
  api: Api,
  path: string,
  key: string,
  items: Item[],
  extra: Record<string, unknown>,
  maxUpload: number,
  progress: (done: number, total: number) => void,
  label: (it: Item) => string,
): Promise<ImportResult> {
  // leave room for the rest of the request (and the server's own overhead)
  const budget = Math.max(64 * 1024, Math.floor(maxUpload * 0.85) - jsonSize(extra) - 256);
  const { chunks, tooBig } = chunkBySize(items, budget);
  const res: ImportResult = { created: [], messages: [] };
  const mb = Math.round((maxUpload / 1048576) * 10) / 10;
  for (const it of tooBig) res.messages.push({ code: 'import_item_too_large', params: { title: label(it), mb } });
  let done = 0;
  progress(0, items.length - tooBig.length);
  for (const chunk of chunks) {
    try {
      const r = await api.post<ImportResult>(path, { [key]: chunk, ...extra });
      res.created.push(...r.created);
      res.messages.push(...r.messages);
    } catch (e) {
      res.messages.push({
        code: 'import_chunk_failed',
        params: { names: chunk.slice(0, 3).map(label).join(', ') + (chunk.length > 3 ? '…' : ''), reason: e instanceof ApiError ? e.code : '' },
      });
    }
    done += chunk.length;
    progress(done, items.length - tooBig.length);
  }
  return res;
}

/** Reads JSON files: one object, a list, or an export file `{<listKey>: [...]}`. */
export async function readJsonFiles(files: File[], listKey: string): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  for (const f of files) {
    let items: Item[] = [];
    try {
      const data = JSON.parse(await f.text());
      const list = Array.isArray(data) ? data : Array.isArray(data?.[listKey]) ? data[listKey] : [data];
      items = list.filter((x: unknown): x is Item => !!x && typeof x === 'object' && !Array.isArray(x));
    } catch {
      items = [];
    }
    out.push({ name: f.webkitRelativePath || f.name, size: f.size, items, error: !items.length });
  }
  return out;
}

/**
 * Batch file picker: several files at once, a whole folder or drag-and-drop (on a computer), added to the list in
 * several goes if needed. Emits the whole list every time it changes.
 */
@Component({
  selector: 'app-json-batch',
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div
      class="drop-zone"
      [class.over]="over()"
      (dragover)="$event.preventDefault(); over.set(true)"
      (dragleave)="over.set(false)"
      (drop)="drop($event)"
    >
      <p class="actions">
        <label class="button">
          📄 {{ 'batch.files' | t }}
          <input type="file" class="sr-only" accept=".json,application/json" multiple (change)="pick($event)" />
        </label>
        <label class="button folder-only">
          📁 {{ 'batch.folder' | t }}
          <input type="file" class="sr-only" webkitdirectory multiple (change)="pick($event)" />
        </label>
      </p>
      <p class="muted small folder-only">{{ 'batch.drop' | t }}</p>
    </div>
    @if (files().length) {
      <ul class="plain batch-list">
        @for (f of files(); track f.name + f.size; let i = $index) {
          <li [class.bad]="f.error">
            <span class="name">{{ f.name }}</span>
            <span class="muted small">
              @if (f.error) {
                {{ 'batch.bad' | t }}
              } @else {
                {{ unit() | t: { n: f.items.length } }} · {{ kb(f.size) }}
              }
            </span>
            <button type="button" class="link" (click)="remove(i)" [attr.aria-label]="'batch.remove' | t">✕</button>
          </li>
        }
      </ul>
      <p class="small">
        {{ 'batch.total' | t: { n: files().length } }} · {{ unit() | t: { n: count() } }}
        <button type="button" class="link" (click)="clear()">{{ 'batch.clear' | t }}</button>
      </p>
    }
  `,
})
export class JsonBatch {
  /** Key of the list in an export file: `recipes` or `menus`. */
  readonly listKey = input.required<string>();
  /** i18n plural key for the item count, e.g. `batch.recipes`. */
  readonly unit = input.required<string>();
  readonly changed = output<PickedFile[]>();

  protected files = signal<PickedFile[]>([]);
  protected over = signal(false);
  protected count = computed(() => this.files().reduce((n, f) => n + f.items.length, 0));

  /** Clears the list (the parent calls this after a successful import). */
  reset(): void {
    this.set([]);
  }

  protected async pick(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // so picking the same file again still works
    await this.add(files);
  }

  protected async drop(ev: DragEvent): Promise<void> {
    ev.preventDefault();
    this.over.set(false);
    await this.add(Array.from(ev.dataTransfer?.files ?? []));
  }

  private async add(files: File[]): Promise<void> {
    // a folder brings everything: keep the JSON files only
    const json = files.filter((f) => /\.json$/i.test(f.name) || f.type === 'application/json');
    const picked = await readJsonFiles(json, this.listKey());
    const known = new Set(this.files().map((f) => f.name + '|' + f.size));
    this.set([...this.files(), ...picked.filter((f) => !known.has(f.name + '|' + f.size))]);
  }

  protected remove(i: number): void {
    this.set(this.files().filter((_, j) => j !== i));
  }

  protected clear(): void {
    this.set([]);
  }

  private set(list: PickedFile[]): void {
    this.files.set(list);
    this.changed.emit(list);
  }

  protected kb(bytes: number): string {
    return bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
  }
}
