import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';
import { Session } from './models';

/** Who is logged in and which server modules are enabled. Loaded once at start, refreshed on login/logout. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private api = inject(Api);
  readonly state = signal<Session | null>(null);
  readonly user = computed(() => this.state()?.user ?? null);
  readonly modules = computed(() => new Set(this.state()?.modules ?? []));

  has(module: string): boolean {
    return this.modules().has(module);
  }

  async ensure(): Promise<Session> {
    return this.state() ?? this.load();
  }

  async load(): Promise<Session> {
    const s = await this.api.get<Session>('session');
    this.state.set(s);
    return s;
  }

  async login(username: string, password: string): Promise<void> {
    this.state.set(await this.api.post<Session>('login', { username, password }));
  }

  async setup(username: string, password: string, display: string): Promise<void> {
    this.state.set(await this.api.post<Session>('setup', { username, password, display }));
  }

  async logout(): Promise<void> {
    this.state.set(await this.api.post<Session>('logout'));
  }
}
