import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { I18n, TPipe } from '../../core/i18n';
import { ShoppingItem, ShoppingList } from '../../core/models';
import { Notify } from '../../core/notify';
import { fmtQty } from '../../core/text-formats';
import { QtyPipe, UnitPipe } from '../../shared/qty.pipe';
import { addDays } from '../meallog/dates';

/**
 * The shopping list of a week for one space (personal, or a household), computed from that space's menus.
 * Personal items can be moved to a household's list ("Inserisci nella lista di casa"), one by one or all at once.
 */
@Component({
  selector: 'app-shopping-list',
  imports: [FormsModule, RouterLink, QtyPipe, UnitPipe, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h1>{{ 'nav.shopping' | t }}</h1>
    @if (list(); as l) {
      <div class="tabs">
        @for (s of l.spaces; track s.id) {
          <button
            type="button"
            [class.active]="s.id === l.space.id"
            [attr.aria-pressed]="s.id === l.space.id"
            (click)="open(s.id, l.week)"
          >
            {{ s.id === 'me' ? ('shop.personal' | t) : s.name }}
          </button>
        }
      </div>
      <div class="page-head week-nav">
        <button
          type="button"
          (click)="open(l.space.id, l.prev)"
          [attr.aria-label]="'common.previous' | t"
        >
          ←
        </button>
        <h2>
          {{
            'shop.week_range'
              | t
                : {
                    from: i18n.date(l.week, { day: 'numeric', month: 'long' }),
                    to: i18n.date(sunday(l.week), { day: 'numeric', month: 'long' }),
                  }
          }}
        </h2>
        <button
          type="button"
          (click)="open(l.space.id, l.next)"
          [attr.aria-label]="'common.next' | t"
        >
          →
        </button>
        <button type="button" class="link" (click)="open(l.space.id, '')">
          {{ 'shop.this_week' | t }}
        </button>
      </div>
      <p class="muted small">
        {{ (l.space.id === 'me' ? 'shop.intro_personal' : 'shop.intro_household') | t }}
      </p>

      <div class="actions">
        <button type="button" (click)="copy()" [disabled]="!todo().length">
          {{ 'shop.copy' | t }}
        </button>
        @if (l.space.id === 'me' && homes().length && l.items.length) {
          @if (homes().length > 1) {
            <select
              [(ngModel)]="target"
              name="target"
              [attr.aria-label]="'scope.which_household' | t"
            >
              @for (h of homes(); track h.id) {
                <option [value]="h.id">{{ h.name }}</option>
              }
            </select>
          }
          <button type="button" (click)="move([], true)">{{ 'shop.move_all' | t }}</button>
        }
      </div>

      @if (sorted().length) {
        <ul class="plain shop">
          @for (i of sorted(); track i.key) {
            <li [class.done]="i.checked">
              <label class="check">
                <input
                  type="checkbox"
                  [checked]="i.checked"
                  (change)="check(i, $any($event.target).checked)"
                />
                <span class="name">{{ i.name }}</span>
              </label>
              <span class="amount"
                >{{ i.qty === null ? '' : (i.qty | qty) }} {{ i.unit | unit }}</span
              >
              @if (i.optional) {
                <span class="badge">{{ 'recipe.optional' | t }}</span>
              }
              @if (i.mixed) {
                <span class="badge warn" [title]="'shop.mixed_title' | t"
                  ><span aria-hidden="true">⚠</span> {{ 'shop.mixed' | t }}</span
                >
              }
              @for (f of i.from; track f) {
                <span class="badge">{{ 'shop.from' | t: { name: f } }}</span>
              }
              @if (i.note) {
                <span class="muted small">— {{ i.note }}</span>
              }
              @if (i.sources.length) {
                <span class="muted small sources">{{ 'shop.for' | t }} {{ sources(i) }}</span>
              }
              <span class="tools">
                @if (l.space.id === 'me' && homes().length) {
                  <button
                    type="button"
                    class="link"
                    (click)="move([i.key])"
                    [title]="'shop.move_one' | t"
                    [attr.aria-label]="('shop.to_home' | t) + ': ' + i.name"
                  >
                    <span aria-hidden="true">→</span> {{ 'shop.to_home' | t }}
                  </button>
                }
                @if (!i.extra) {
                  <button
                    type="button"
                    class="link"
                    (click)="toPantry(i.name)"
                    [title]="'shop.pantry_add_title' | t"
                    [attr.aria-label]="('shop.in_pantry' | t) + ': ' + i.name"
                  >
                    {{ 'shop.in_pantry' | t }}
                  </button>
                } @else {
                  <button
                    type="button"
                    class="icon"
                    (click)="removeExtra(i)"
                    [attr.aria-label]="'common.remove_named' | t: { name: i.name }"
                  >
                    ✕
                  </button>
                }
              </span>
            </li>
          }
        </ul>
      } @else {
        <p class="muted">
          {{ 'shop.empty' | t }} <a routerLink="/menu">{{ 'shop.go_menus' | t }}</a>
        </p>
      }

      <form class="row add-extra" (ngSubmit)="addExtra()">
        <label
          >{{ 'shop.extra' | t }}
          <input name="xn" [(ngModel)]="xName" [placeholder]="'shop.extra_placeholder' | t"
        /></label>
        <label>{{ 'form.qty' | t }} <input name="xq" [(ngModel)]="xQty" class="qty" /></label>
        <label>{{ 'form.unit' | t }} <input name="xu" [(ngModel)]="xUnit" class="unit" /></label>
        <button type="submit">{{ 'common.add' | t }}</button>
      </form>

      @if (l.moved.length) {
        <section class="card">
          <h2>{{ 'shop.moved_title' | t }}</h2>
          <ul class="plain">
            @for (i of l.moved; track i.key) {
              <li>
                {{ i.name }}
                <span class="muted"
                  >{{ i.qty === null ? '' : (i.qty | qty) }} {{ i.unit | unit }}</span
                >
                <span class="badge">{{ i.household_name }}</span>
                <button type="button" class="link" (click)="unmove([i.key])" [attr.aria-label]="('shop.bring_back' | t) + ': ' + i.name">
                  {{ 'shop.bring_back' | t }}
                </button>
              </li>
            }
          </ul>
        </section>
      }

      <details class="card">
        <summary>{{ 'shop.pantry' | t }} ({{ l.pantry.length }})</summary>
        <p class="muted small">
          {{
            (l.space.id === 'me' ? 'shop.pantry_intro_personal' : 'shop.pantry_intro_household') | t
          }}
        </p>
        <div class="chips">
          @for (p of l.pantry; track p) {
            <span class="chip"
              >{{ p }}
              <button
                type="button"
                class="link"
                (click)="fromPantry(p)"
                [attr.aria-label]="'common.remove_named' | t: { name: p }"
              >
                ✕
              </button></span
            >
          } @empty {
            <span class="muted small">—</span>
          }
        </div>
        <form class="row" (ngSubmit)="toPantry(pName); pName = ''">
          <label>{{ 'shop.pantry_add' | t }} <input name="pn" [(ngModel)]="pName" /></label>
          <button type="submit">{{ 'common.add' | t }}</button>
        </form>
      </details>
    } @else {
      <p class="muted">{{ 'common.loading' | t }}</p>
    }
  `,
})
export class ShoppingListPage implements OnInit {
  protected i18n = inject(I18n);
  private api = inject(Api);
  private notify = inject(Notify);
  protected list = signal<ShoppingList | null>(null);
  protected target = '';
  protected xName = '';
  protected xQty = '';
  protected xUnit = '';
  protected pName = '';

  /** Households the personal list can be moved to. */
  protected homes = computed(() => (this.list()?.spaces ?? []).filter((s) => s.id !== 'me'));
  /** Unticked first. */
  protected sorted = computed(() =>
    [...(this.list()?.items ?? [])].sort((a, b) => Number(a.checked) - Number(b.checked)),
  );
  protected todo = computed(() => (this.list()?.items ?? []).filter((i) => !i.checked));

  ngOnInit(): void {
    this.open('me', '');
  }

  protected sunday(monday: string): string {
    return addDays(monday, 6);
  }

  private get where() {
    const l = this.list()!;
    return { space: l.space.id, week: l.week };
  }

  async open(space: string, week: string): Promise<void> {
    try {
      const l = await this.api.get<ShoppingList>('shopping', { space, week });
      this.list.set(l);
      if (!this.homes().some((h) => h.id === this.target)) this.target = this.homes()[0]?.id ?? '';
    } catch (e) {
      this.notify.error(e);
    }
  }

  protected sources(i: ShoppingItem): string {
    const titles = [
      ...new Set(i.sources.map((s) => s.title ?? this.i18n.t('common.unavailable_recipe'))),
    ];
    return titles.join(', ');
  }

  private async run(path: string, body: Record<string, unknown>): Promise<void> {
    try {
      this.list.set(await this.api.post<ShoppingList>(path, { ...this.where, ...body }));
    } catch (e) {
      this.notify.error(e);
    }
  }

  check(i: ShoppingItem, checked: boolean): void {
    this.run('shopping/check', { key: i.key, checked });
  }

  async addExtra(): Promise<void> {
    if (!this.xName.trim()) return;
    await this.run('shopping/extra', { name: this.xName, qty: this.xQty, unit: this.xUnit });
    this.xName = this.xQty = this.xUnit = '';
  }

  removeExtra(i: ShoppingItem): void {
    this.run('shopping/extra/remove', { id: i.id });
  }

  async move(keys: string[], all = false): Promise<void> {
    const home = this.homes().find((h) => h.id === this.target) ?? this.homes()[0];
    if (!home) return;
    if (all && !confirm(this.i18n.t('shop.confirm_move_all', { name: home.name }))) return;
    await this.run('shopping/move', { household: home.id, keys, all });
    this.notify.ok('shop.moved', { name: home.name });
  }

  unmove(keys: string[]): void {
    this.run('shopping/unmove', { keys });
  }

  async toPantry(name: string): Promise<void> {
    if (!name.trim()) return;
    try {
      await this.api.post('pantry', { space: this.where.space, name });
      await this.open(this.where.space, this.where.week);
    } catch (e) {
      this.notify.error(e);
    }
  }

  async fromPantry(name: string): Promise<void> {
    try {
      await this.api.post('pantry/remove', { space: this.where.space, name });
      await this.open(this.where.space, this.where.week);
    } catch (e) {
      this.notify.error(e);
    }
  }

  /** The unticked items as plain text, e.g. to paste in a chat. */
  async copy(): Promise<void> {
    const lines = this.todo().map((i) => {
      const amount =
        i.qty === null
          ? i.unit === 'q.b.'
            ? this.i18n.t('qty.qb')
            : ''
          : `${fmtQty(i.qty, this.i18n.lang)} ${i.unit}`;
      return `- ${i.name}${amount.trim() ? ` (${amount.trim()})` : ''}`;
    });
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      this.notify.ok('shop.copied');
    } catch {
      prompt(this.i18n.t('shop.copy'), lines.join(' · '));
    }
  }
}
