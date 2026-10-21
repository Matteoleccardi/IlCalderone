import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
              <button
                type="button"
                class="icon row-menu"
                (click)="openMenu(i)"
                [attr.aria-label]="'shop.row_menu' | t: { name: i.name }"
              >
                <span aria-hidden="true">⋯</span>
              </button>
              @if (i.optional || i.mixed || i.from.length || i.note || i.sources.length) {
                <span class="row-meta">
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
                    <span>{{ i.note }}</span>
                  }
                  @if (i.sources.length) {
                    <span>{{ 'shop.for' | t }} {{ sources(i) }}</span>
                  }
                </span>
              }
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
        <form class="row" (ngSubmit)="addPantry()">
          <label>{{ 'shop.pantry_add' | t }} <input name="pn" [(ngModel)]="pName" /></label>
          <button type="submit">{{ 'common.add' | t }}</button>
        </form>
      </details>
      <dialog class="sheet" #rowSheet aria-labelledby="row-menu-title" (click)="$event.target === rowSheet && closeMenu()">
        @if (menuItem(); as m) {
          <h2 id="row-menu-title">{{ m.name }}</h2>
          @if (l.space.id === 'me' && homes().length) {
            <button type="button" class="sheet-btn" (click)="toHome(m)">{{ 'shop.to_home' | t }}</button>
          }
          @if (!m.extra) {
            <button type="button" class="sheet-btn" (click)="toPantryFromSheet(m)">{{ 'shop.in_pantry' | t }}</button>
          } @else {
            <button type="button" class="sheet-btn danger" (click)="removeFromSheet(m)">{{ 'common.remove' | t }}</button>
          }
          <button type="button" class="link" (click)="closeMenu()">{{ 'app.close' | t }}</button>
        }
      </dialog>
    } @else {
      <p class="muted">{{ 'common.loading' | t }}</p>
    }
  `,
})
export class ShoppingListPage {
  /**
   * What is shown lives in the address, so reload and Back keep it: ?space=<household id> (absent = personal list)
   * and ?week=<any day of the week> (absent = the current shopping week). Bound by the router.
   */
  readonly space = input<string>('');
  readonly week = input<string>('');

  protected i18n = inject(I18n);
  private api = inject(Api);
  private notify = inject(Notify);
  private router = inject(Router);
  protected list = signal<ShoppingList | null>(null);
  protected target = '';
  protected xName = '';
  protected xQty = '';
  protected xUnit = '';
  protected pName = '';
  /** The item whose "…" sheet is open (move to the household, always at home, remove). */
  protected menuItem = signal<ShoppingItem | null>(null);
  private rowSheet = viewChild<ElementRef<HTMLDialogElement>>('rowSheet');

  /** Households the personal list can be moved to. */
  protected homes = computed(() => (this.list()?.spaces ?? []).filter((s) => s.id !== 'me'));
  /** Unticked first. */
  protected sorted = computed(() =>
    [...(this.list()?.items ?? [])].sort((a, b) => Number(a.checked) - Number(b.checked)),
  );
  protected todo = computed(() => (this.list()?.items ?? []).filter((i) => !i.checked));

  constructor() {
    effect(() => {
      void this.load(this.space() || 'me', this.week() || '');
    });
  }

  protected sunday(monday: string): string {
    return addDays(monday, 6);
  }

  private get where() {
    const l = this.list()!;
    return { space: l.space.id, week: l.week };
  }

  /** Shows another space or week: changes the address (default values are left out); the effect above loads it. */
  open(space: string, week: string): void {
    void this.router.navigate(['/spesa'], {
      queryParams: { space: space === 'me' ? null : space, week: week || null },
    });
  }

  private async load(space: string, week: string): Promise<void> {
    try {
      const l = await this.api.get<ShoppingList>('shopping', { space, week });
      this.list.set(l);
      if (!this.homes().some((h) => h.id === this.target)) this.target = this.homes()[0]?.id ?? '';
    } catch (e) {
      this.notify.error(e);
      // an address that points at a space you cannot see: go back to the personal list instead of staying empty
      if (space !== 'me') {
        void this.router.navigate(['/spesa'], { replaceUrl: true });
      }
    }
  }

  protected openMenu(i: ShoppingItem): void {
    this.menuItem.set(i);
    this.rowSheet()?.nativeElement.showModal();
  }

  protected closeMenu(): void {
    this.rowSheet()?.nativeElement.close();
  }

  protected async toHome(i: ShoppingItem): Promise<void> {
    this.closeMenu();
    await this.move([i.key]);
  }

  protected async toPantryFromSheet(i: ShoppingItem): Promise<void> {
    this.closeMenu();
    await this.toPantry(i.name);
  }

  protected removeFromSheet(i: ShoppingItem): void {
    this.closeMenu();
    this.removeExtra(i);
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

  /** True when the item went into the pantry. */
  async toPantry(name: string): Promise<boolean> {
    if (!name.trim()) return false;
    try {
      await this.api.post('pantry', { space: this.where.space, name });
      await this.load(this.where.space, this.where.week);
      return true;
    } catch (e) {
      this.notify.error(e);
      return false;
    }
  }

  /** The "add to pantry" form: the field is emptied only when the item was added. */
  protected async addPantry(): Promise<void> {
    if (await this.toPantry(this.pName)) this.pName = '';
  }

  async fromPantry(name: string): Promise<void> {
    try {
      await this.api.post('pantry/remove', { space: this.where.space, name });
      await this.load(this.where.space, this.where.week);
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
