import { Injectable, inject, signal } from '@angular/core';
import { Api } from './api';
import { Household } from './models';

/** The households of the logged-in user (cached; call refresh() after changes). */
@Injectable({ providedIn: 'root' })
export class HouseholdsService {
  private api = inject(Api);
  readonly list = signal<Household[]>([]);
  private loaded = false;

  async ensure(): Promise<Household[]> {
    if (!this.loaded) await this.refresh();
    return this.list();
  }

  async refresh(): Promise<Household[]> {
    this.list.set(await this.api.get<Household[]>('households'));
    this.loaded = true;
    return this.list();
  }

  name(id: string | null): string {
    return this.list().find((h) => h.id === id)?.name ?? '';
  }

  reset(): void {
    this.loaded = false;
    this.list.set([]);
  }
}
