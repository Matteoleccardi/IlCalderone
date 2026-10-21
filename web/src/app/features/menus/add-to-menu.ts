import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { RecipeActionComponent, RecipeRef } from '../../core/features';
import { I18n, TPipe } from '../../core/i18n';
import { Meal, Menu, MenuSummary } from '../../core/models';
import { Notify } from '../../core/notify';

const LAST_MENU = 'calderone.lastMenu';

/**
 * "Add to menu" on recipe cards and the recipe page: a dialog to choose the menu, week, day and meal, showing what
 * is already planned in that slot. Only menus you can edit and where everyone can see the recipe are offered.
 */
@Component({
  selector: 'app-add-to-menu',
  imports: [FormsModule, RouterLink, TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <button
      type="button"
      [class]="compact() ? 'icon add-to-menu' : 'add-to-menu'"
      (click)="openDialog()"
      [title]="'addmenu.button' | t"
      [attr.aria-label]="'addmenu.button' | t"
    >
      📅 @if (!compact()) { {{ 'addmenu.button' | t }} } @else { + }
    </button>

    <dialog #dlg class="sheet" [attr.aria-labelledby]="uid + '-title'" (close)="opened.set(false)" (click)="backdrop($event)">
      @if (opened()) {
        <form method="dialog" (submit)="$event.preventDefault(); add()">
          <h2 [id]="uid + '-title'">{{ 'addmenu.title' | t }}</h2>
          <p class="muted">{{ recipe().title }}</p>

          @if (loading()) {
            <p class="muted">{{ 'common.loading' | t }}</p>
          } @else if (!usable().length) {
            <p>{{ 'addmenu.no_menus' | t }}</p>
            @if (hidden() > 0) {
              <p class="muted small">{{ 'addmenu.some_hidden' | t: { n: hidden() } }}</p>
            }
            <p><a routerLink="/menu" (click)="dlg.close()">{{ 'addmenu.create' | t }}</a></p>
          } @else {
            <label
              >{{ 'menus.one' | t }}
              <select name="menu" [ngModel]="menuId()" (ngModelChange)="selectMenu($event)">
                @for (m of usable(); track m.id) {
                  <option [value]="m.id">
                    {{ m.name }} · {{ m.household_name ?? ('space.me' | t) }}
                  </option>
                }
              </select>
            </label>
            @if (hidden() > 0) {
              <p class="muted small">{{ 'addmenu.some_hidden' | t: { n: hidden() } }}</p>
            }

            @if (menu(); as m) {
              @if (m.weeks > 1) {
                <fieldset class="choice">
                  <legend>{{ 'addmenu.week' | t }}</legend>
                  @for (w of weeks(); track w) {
                    <button type="button" [class.on]="w === week()" [attr.aria-pressed]="w === week()" (click)="week.set(w)">
                      {{ w }}
                      @if (w === m.today.week && m.active && m.in_season) {
                        <small>{{ 'menus.this_week' | t }}</small>
                      }
                    </button>
                  }
                </fieldset>
              }
              <fieldset class="choice days">
                <legend>{{ 'addmenu.day' | t }}</legend>
                @for (dn of dayNames; track $index; let d = $index) {
                  <button
                    type="button"
                    [class.on]="d + 1 === day()"
                    [class.today]="isToday(d + 1)"
                    [attr.aria-pressed]="d + 1 === day()"
                    [attr.aria-label]="longDays[d]"
                    (click)="day.set(d + 1)"
                  >
                    {{ dn }}
                  </button>
                }
              </fieldset>
              @if (m.meals.length > 1) {
                <fieldset class="choice">
                  <legend>{{ 'menus.meals' | t }}</legend>
                  @for (x of m.meals; track x) {
                    <button type="button" [class.on]="x === meal()" [attr.aria-pressed]="x === meal()" (click)="meal.set(x)">
                      {{ 'meal.' + x | t }}
                    </button>
                  }
                </fieldset>
              }

              <p class="small slot">
                <strong>{{ longDays[day() - 1] }} · {{ 'meal.' + meal() | t }}</strong>
                @if (m.weeks > 1) { · {{ 'menus.week_n' | t: { n: week() } }} }
                <br />
                @if (inSlot().length) {
                  {{ 'addmenu.already' | t }} {{ inSlot().join(', ') }}
                } @else {
                  <span class="muted">{{ 'addmenu.empty_slot' | t }}</span>
                }
              </p>

              <label
                >{{ 'diary.servings' | t }}
                <input
                  name="servings"
                  type="number"
                  inputmode="decimal"
                  min="0.5"
                  step="0.5"
                  [(ngModel)]="servings"
                  [placeholder]="recipe().servings"
                />
              </label>
            }
          }

          <div class="actions">
            @if (usable().length) {
              <button type="submit" class="primary" [disabled]="busy() || !menu()">
                {{ 'addmenu.add' | t }}
              </button>
            }
            <button type="button" (click)="dlg.close()">{{ 'common.cancel' | t }}</button>
          </div>
        </form>
      }
    </dialog>
  `,
})
export class AddToMenu implements RecipeActionComponent {
  readonly recipe = input.required<RecipeRef>();
  readonly compact = input(false);

  private static next = 0;
  protected uid = `atm-${AddToMenu.next++}`;
  private api = inject(Api);
  private i18n = inject(I18n);
  private notify = inject(Notify);
  private dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected opened = signal(false);
  protected loading = signal(false);
  protected busy = signal(false);
  private all = signal<MenuSummary[]>([]);
  protected menuId = signal<string | null>(null);
  protected menu = signal<Menu | null>(null);
  protected week = signal(1);
  protected day = signal(1);
  protected meal = signal<Meal>('cena');
  protected servings: number | null = null;
  protected dayNames = this.i18n.weekdays('short');
  protected longDays = this.i18n.weekdays('long');

  /** Menus you can change and whose users can all see this recipe (same rule as the server's Menus::fits). */
  protected usable = computed(() => {
    const r = this.recipe();
    return this.all()
      .filter((m) => m.can_edit)
      .filter(
        (m) =>
          m.visibility !== 'household' ||
          r.visibility === 'shared' ||
          (r.visibility === 'household' && r.household === m.household),
      )
      .sort((a, b) => Number(b.active) - Number(a.active) || this.i18n.compare(a.name, b.name));
  });
  protected hidden = computed(() => this.all().filter((m) => m.can_edit).length - this.usable().length);
  protected weeks = computed(() => Array.from({ length: this.menu()?.weeks ?? 1 }, (_, i) => i + 1));

  protected inSlot = computed(() =>
    (this.menu()?.items ?? [])
      .filter((it) => it.week === this.week() && it.day === this.day() && it.meal === this.meal())
      .map((it) => (it.recipe ? (it.title ?? this.i18n.t('common.unavailable_recipe')) : it.text)),
  );

  async openDialog(): Promise<void> {
    this.opened.set(true);
    this.servings = null;
    this.dlg().nativeElement.showModal();
    this.loading.set(true);
    try {
      this.all.set(await this.api.get<MenuSummary[]>('menus'));
      const list = this.usable();
      let last: string | null = null;
      try {
        last = localStorage.getItem(LAST_MENU);
      } catch {
        /* storage blocked */
      }
      const pick = list.find((m) => m.id === last) ?? list[0];
      if (pick) await this.selectMenu(pick.id);
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  async selectMenu(id: string): Promise<void> {
    this.menuId.set(id);
    try {
      const m = await this.api.get<Menu>(`menus/${id}`);
      this.menu.set(m);
      const running = m.active && m.in_season;
      this.week.set(running ? m.today.week : 1);
      this.day.set(running ? m.today.day : 1);
      this.meal.set(m.meals.includes(this.meal()) ? this.meal() : m.meals.includes('cena') ? 'cena' : m.meals[0]);
    } catch (e) {
      this.notify.error(e);
    }
  }

  protected isToday(d: number): boolean {
    const m = this.menu();
    return !!m && m.active && m.in_season && m.today.week === this.week() && m.today.day === d;
  }

  async add(): Promise<void> {
    const m = this.menu();
    if (!m) return;
    this.busy.set(true);
    try {
      this.menu.set(
        await this.api.post<Menu>(`menus/${m.id}/items`, {
          week: this.week(),
          day: this.day(),
          meal: this.meal(),
          recipe: this.recipe().id,
          servings: this.servings || null,
        }),
      );
      try {
        localStorage.setItem(LAST_MENU, m.id);
      } catch {
        /* storage blocked */
      }
      this.notify.ok('addmenu.added', {
        menu: m.name,
        day: this.longDays[this.day() - 1],
        meal: this.i18n.t('meal.' + this.meal()),
      });
      this.dlg().nativeElement.close();
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  /** Tapping outside the sheet closes it. */
  protected backdrop(e: MouseEvent): void {
    if (e.target === this.dlg().nativeElement) this.dlg().nativeElement.close();
  }
}
