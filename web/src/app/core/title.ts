import { Injectable, inject } from '@angular/core';
import { I18n } from './i18n';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Page title = "<route title> · Il Calderone". Route titles are translation keys. */
@Injectable()
export class AppTitle extends TitleStrategy {
  private title = inject(Title);
  private i18n = inject(I18n);

  override updateTitle(state: RouterStateSnapshot): void {
    const t = this.buildTitle(state);
    this.title.setTitle(t ? `${this.i18n.t(t)} · Il Calderone` : 'Il Calderone');
  }

  /** For pages whose title depends on data (e.g. a recipe). */
  set(t: string): void {
    this.title.setTitle(`${t} · Il Calderone`);
  }
}
