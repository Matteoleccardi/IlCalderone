import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, viewChild,
} from '@angular/core';
import { Api } from '../core/api';
import { TPipe } from '../core/i18n';
import { VoxModel, readVox } from '../core/vox';
import { ThemeService } from '../core/theme';
import type { DishScene } from './dish-scene';

/**
 * The picture at the top of a recipe page. When the recipe has a voxel model (MagicaVoxel .vox, core/vox.ts), the
 * dish plays once on opening: seen from above (exactly like the picture made from the same model), the camera tilts,
 * circles the table and returns to the top, then the picture comes back. Tap the picture (or the 3D button) to replay.
 * Three.js is loaded only here, on demand. Without a model or WebGL, or with "reduce motion" (no autoplay), the page
 * just shows the picture.
 */
@Component({
  selector: 'app-dish-stage',
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { class: 'dish-stage', '[class.playing]': 'playing()', '[class.can-play]': 'ready()', '[hidden]': '!visible()', '(click)': 'play()' },
  template: `
    @if (photo()) {
      <img class="hero-photo" [src]="api.photoUrl(recipeId(), version())" [alt]="alt()" />
    } @else if (model() && icon()) {
      <img class="hero-photo dish-flat" [src]="api.iconUrl(recipeId(), version())" [alt]="alt()" />
    }
    <canvas #cv class="dish-canvas" aria-hidden="true"></canvas>
    @if (ready()) {
      <button type="button" class="dish-play" (click)="play()" [disabled]="playing()"
        [title]="'dish3d.play' | t" [attr.aria-label]="'dish3d.play' | t">3D ⟳</button>
    }
  `,
})
export class DishStage {
  protected api = inject(Api);
  private theme = inject(ThemeService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly recipeId = input.required<string>();
  readonly version = input<string | undefined>();
  readonly photo = input(false);
  readonly icon = input(false);
  /** The recipe has a .vox model. */
  readonly hasModel = input(false);
  readonly alt = input('');

  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  protected model = signal<VoxModel | null>(null);
  protected ready = signal(false);
  protected playing = signal(false);
  protected visible = computed(() => this.photo() || (!!this.model() && this.icon()));

  private scene: DishScene | null = null;
  private loadToken = 0;

  constructor() {
    effect(() => {
      const id = this.recipeId(), v = this.version(), has = this.hasModel();
      void this.load(id, v, has);
    });
    effect(() => this.scene?.setDark(this.theme.activeKind() === 'dark'));
    inject(DestroyRef).onDestroy(() => {
      this.loadToken++;
      this.scene?.dispose();
      this.scene = null;
    });
  }

  private async load(id: string, version: string | undefined, has: boolean): Promise<void> {
    const token = ++this.loadToken;
    this.scene?.dispose();
    this.scene = null;
    this.ready.set(false);
    this.model.set(null);
    if (!has || typeof fetch !== 'function') return;
    try {
      const res = await fetch(this.api.modelUrl(id, version), { credentials: 'same-origin' });
      if (!res.ok) return;
      const model = readVox(await res.arrayBuffer());
      if (!model || token !== this.loadToken) return;
      this.model.set(model);
      const { DishScene } = await import('./dish-scene');
      if (token !== this.loadToken) return;
      const scene = DishScene.create(this.canvas().nativeElement, this.host.nativeElement, model);
      if (!scene) return; // no WebGL
      this.scene = scene;
      scene.setDark(this.theme.activeKind() === 'dark');
      this.ready.set(true);
      const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduce) this.whenVisible(() => token === this.loadToken && this.play());
    } catch {
      // a broken model or no WebGL: the picture stays
    }
  }

  /** Run once the stage is mostly on screen (the page may open scrolled). */
  private whenVisible(fn: () => void): void {
    if (typeof IntersectionObserver !== 'function') return fn();
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        fn();
      }
    }, { threshold: 0.6 });
    io.observe(this.host.nativeElement);
  }

  protected async play(): Promise<void> {
    if (!this.scene || this.playing()) return;
    this.playing.set(true);
    try {
      await this.scene.play();
    } finally {
      this.playing.set(false);
    }
  }
}
