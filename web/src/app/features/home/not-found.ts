import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TPipe } from '../../core/i18n';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, TPipe],
  template: `<section class="narrow"><h1>{{ 'notfound.title' | t }}</h1><p><a routerLink="/">{{ 'notfound.back' | t }}</a></p></section>`,
})
export class NotFound {}
