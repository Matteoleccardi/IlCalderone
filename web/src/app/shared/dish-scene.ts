import {
  AmbientLight, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, Group, HemisphereLight, Mesh,
  MeshStandardMaterial, OrthographicCamera, PCFSoftShadowMap, PlaneGeometry, Scene, ShadowMaterial, SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { VoxModel } from '../core/vox';

/**
 * The voxel dish of dish-stage.ts (loaded on demand, with Three.js): a MagicaVoxel model of the dish and its cutlery
 * on the table. Only the faces next to empty space are drawn, with soft shading in the corners (ambient occlusion).
 * The animation starts and ends seen from straight above, framed exactly like the recipe picture that
 * tools/dish_kit.py renders from the same model, so the two crossfade.
 *
 * Lights (none of them is visible): a soft overcast sky (strong on light themes, dim on dark ones), a warm key light
 * that casts the shadows, and a golden light from the other side that gives the shiny highlights.
 */
export class DishScene {
  /** Part of the stage the model fills from above: the same rule as dish_kit.py's top-view picture. */
  static readonly FILL = 0.92;
  private static readonly DURATION = 7000;

  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private readonly dish = new Group();
  private readonly table = new ShadowMaterial({ opacity: 0 });
  private readonly sky = new HemisphereLight(0xfff6ea, 0x6b5a4a, 1);
  private readonly fill = new AmbientLight(0xffffff, 0);
  private readonly warm = new DirectionalLight(0xffcf9e, 1);
  private readonly gold = new DirectionalLight(0xffdf86, 1);
  private readonly ro: ResizeObserver;
  private readonly radius: number;
  private readonly lift: number;
  /** Zoom while tilted, so the model's diagonal stays in the frame as it turns. */
  private turnZoom = 1;
  private disposed = false;
  private frame = 0;
  private resolveRun: (() => void) | null = null;

  private constructor(
    private readonly renderer: WebGLRenderer,
    private readonly stage: HTMLElement,
    private readonly model: VoxModel,
  ) {
    const { sx, sy, sz } = model;
    this.radius = Math.max(sx, sy, sz) * 2;
    this.lift = highest(model) / 2;

    const { solid, glass } = buildMeshes(model);
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 });
    const body = new Mesh(solid, mat);
    body.castShadow = true;
    body.receiveShadow = true;
    this.dish.add(body);
    if (glass.getAttribute('position').count) {
      const steam = new Mesh(glass, new MeshStandardMaterial({
        vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, roughness: 1,
      }));
      this.dish.add(steam);
    }
    // a soft contact shadow on the (invisible) table
    const floor = new Mesh(new PlaneGeometry(sx * 3, sy * 3), this.table);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    floor.receiveShadow = true;
    this.dish.add(floor);
    this.scene.add(this.dish);

    // lights, fixed in the room: the dish turns under them, so the highlights move
    const n = Math.max(sx, sy);
    this.warm.position.set(-n * 0.9, n * 1.6, n * 0.9);
    this.warm.castShadow = true;
    this.warm.shadow.mapSize.set(2048, 2048);
    const sc = this.warm.shadow.camera;
    sc.left = sc.bottom = -n;
    sc.right = sc.top = n;
    sc.near = 1;
    sc.far = n * 6;
    this.warm.shadow.bias = -0.001;
    this.warm.shadow.normalBias = 0.03;
    this.gold.position.set(n * 1.1, n * 0.9, -n * 0.6);
    this.scene.add(this.sky, this.fill, this.warm, this.gold);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    this.setDark(false);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(stage);
    this.resize();
  }

  /** null when the browser has no WebGL. */
  static create(canvas: HTMLCanvasElement, stage: HTMLElement, model: VoxModel): DishScene | null {
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      return null;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    return new DishScene(renderer, stage, model);
  }

  /** Light themes get a bright overcast sky, dark themes a dim one (the warm and golden lights carry the scene). */
  setDark(dark: boolean): void {
    if (this.disposed) return;
    this.sky.intensity = dark ? 0.55 : 1.9;
    this.fill.intensity = dark ? 0.1 : 0.35;
    this.warm.intensity = dark ? 1.9 : 1.6;
    this.gold.intensity = dark ? 1.5 : 1.1;
    this.render();
  }

  /** One full animation; resolves when the flat picture is back. */
  play(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    cancelAnimationFrame(this.frame);
    this.resolveRun?.();
    return new Promise((resolve) => {
      this.resolveRun = resolve;
      const start = performance.now();
      const tick = (now: number) => {
        if (this.disposed) return resolve();
        const t = Math.min(1, (now - start) / DishScene.DURATION);
        this.pose(t);
        this.render();
        if (t < 1) {
          this.frame = requestAnimationFrame(tick);
        } else {
          this.resolveRun = null;
          resolve();
        }
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resolveRun?.();
    this.ro.disconnect();
    this.scene.traverse((o) => {
      const mesh = o as Partial<Mesh>;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
    });
    this.warm.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.stage.style.removeProperty('--dish-fade');
  }

  // ---- the timeline, t from 0 to 1
  //   0.00–0.05 fade in, seen from above (= the picture)
  //   0.05–0.22 tilt down to 30°, zoom out so the whole table stays in view
  //   0.05–0.88 one full turn
  //   0.72–0.90 back up
  //   0.93–1.00 fade out to the picture
  private pose(t: number): void {
    const ease = (a: number, b: number) => smooth(Math.min(1, Math.max(0, (t - a) / (b - a))));
    const up = ease(0.05, 0.22) * (1 - ease(0.72, 0.9));
    const elev = (90 - 60 * up) * (Math.PI / 180);
    this.dish.rotation.y = -ease(0.05, 0.88) * Math.PI * 2;
    const target = this.lift * up;
    // the camera moves on a vertical plane in front of the dish; "up" is the tangent, so from above the picture is upright
    this.camera.position.set(0, target + this.radius * Math.sin(elev), this.radius * Math.cos(elev));
    this.camera.up.set(0, Math.cos(elev), -Math.sin(elev));
    this.camera.lookAt(0, target, 0);
    this.camera.zoom = 1 + (this.turnZoom - 1) * up;
    this.table.opacity = 0.22 * up; // the shadow on the table only while tilted: from above it matches the picture
    this.camera.updateProjectionMatrix();
    const fade = t <= 0 || t >= 1 ? 0 : Math.min(ease(0, 0.05), 1 - ease(0.93, 1));
    // crossfade with the picture under the canvas (styles.css reads --dish-fade)
    this.stage.style.setProperty('--dish-fade', String(fade));
  }

  private resize(): void {
    if (this.disposed) return;
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const { sx, sy } = this.model;
    // CSS pixels per voxel, from above: the picture (1024×768, shown 4:3) uses whole pixels per voxel; do the same
    const cell = Math.max(1, Math.floor(DishScene.FILL * Math.min(1024 / sx, 768 / sy)));
    const scale = (cell * w) / 1024;
    const halfW = w / 2 / scale, halfH = h / 2 / scale;
    Object.assign(this.camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    this.camera.near = 0.1;
    this.camera.far = this.radius * 4;
    // turning, the footprint's diagonal must fit the width (and, foreshortened, the height)
    const diag = Math.hypot(sx, sy) * 1.04;
    this.turnZoom = Math.min(1, (2 * halfW) / diag, (2 * halfH) / (diag * 0.62 + this.lift * 1.6));
    this.pose(0);
    this.render();
  }

  private render(): void {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }
}

function smooth(x: number): number {
  return x * x * (3 - 2 * x);
}

/** Highest filled layer + 1. */
function highest(m: VoxModel): number {
  for (let z = m.sz - 1; z >= 0; z--) {
    const layer = m.cells.subarray(m.sx * m.sy * z, m.sx * m.sy * (z + 1));
    if (layer.some((c) => c)) return z + 1;
  }
  return 1;
}

/**
 * Faces next to empty (or see-through) cells, as two geometries: solid, and see-through (alpha < 255, steam).
 * Three.js axes: x = vox x, y = vox z (up), z = −vox y (the back of the model away from the camera), centred.
 */
function buildMeshes(m: VoxModel): { solid: BufferGeometry; glass: BufferGeometry } {
  const { sx, sy, sz, cells, palette } = m;
  const at = (x: number, y: number, z: number) =>
    x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? 0 : cells[x + sx * (y + sy * z)];
  const clear = (i: number) => i === 0 || palette[(i - 1) * 4 + 3] < 255;
  const filled = (x: number, y: number, z: number) => !clear(at(x, y, z));
  // the six faces in vox coordinates: normal and the 4 corners (counter-clockwise seen from outside)
  const FACES: { n: number[]; c: number[][] }[] = [
    { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], c: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]] },
    { n: [0, 1, 0], c: [[1, 1, 0], [0, 1, 0], [0, 1, 1], [1, 1, 1]] },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], c: [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]] },
  ];
  const AO = [1, 0.86, 0.74, 0.62];
  const out = { solid: newBuf(), glass: newBuf() };
  const col = new Color();
  const ox = sx / 2, oy = sy / 2;
  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      for (let x = 0; x < sx; x++) {
        const i = at(x, y, z);
        if (!i) continue;
        const see = clear(i);
        const buf = see ? out.glass : out.solid;
        const p = (i - 1) * 4;
        col.setRGB(palette[p] / 255, palette[p + 1] / 255, palette[p + 2] / 255, SRGBColorSpace);
        for (const f of FACES) {
          const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
          const j = at(nx, ny, nz);
          if (see ? j !== 0 : !clear(j)) continue; // hidden face
          // ambient occlusion: the two side cells and the corner cell next to each vertex, in the layer in front
          const axes = [0, 1, 2].filter((k) => f.n[k] === 0);
          const shade = f.c.map((c) => {
            if (see) return 1;
            const d = [0, 0, 0];
            for (const k of axes) d[k] = c[k] * 2 - 1;
            const a = filled(nx + (axes[0] === 0 ? d[0] : 0), ny + (axes[0] === 1 ? d[1] : 0), nz + (axes[0] === 2 ? d[2] : 0));
            const b = filled(nx + (axes[1] === 0 ? d[0] : 0), ny + (axes[1] === 1 ? d[1] : 0), nz + (axes[1] === 2 ? d[2] : 0));
            const corner = filled(nx + d[0], ny + d[1], nz + d[2]);
            return AO[a && b ? 3 : Number(a) + Number(b) + Number(corner)];
          });
          const base = buf.pos.length / 3;
          f.c.forEach((c, k) => {
            buf.pos.push(x + c[0] - ox, z + c[2], -(y + c[1] - oy));
            buf.nor.push(f.n[0], f.n[2], -f.n[1]);
            buf.col.push(col.r * shade[k], col.g * shade[k], col.b * shade[k]);
          });
          // split the quad along the brighter diagonal, so the shading has no seams
          if (shade[0] + shade[2] >= shade[1] + shade[3]) buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          else buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
        }
      }
    }
  }
  return { solid: toGeometry(out.solid), glass: toGeometry(out.glass) };
}

function newBuf() {
  return { pos: [] as number[], nor: [] as number[], col: [] as number[], idx: [] as number[] };
}

function toGeometry(b: ReturnType<typeof newBuf>): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(b.nor, 3));
  g.setAttribute('color', new Float32BufferAttribute(b.col, 3));
  g.setIndex(b.idx);
  return g;
}
