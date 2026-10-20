/**
 * Reader for MagicaVoxel .vox files (https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.md),
 * the format of the recipes' 3D dish models (written by tools/dish_kit.py, editable in MagicaVoxel).
 * Only the first model is read; scene graph, layers and materials are ignored.
 * Axes as in MagicaVoxel: x to the right, y to the back, z up.
 */
export interface VoxModel {
  sx: number;
  sy: number;
  sz: number;
  /** Palette index per cell (0 = empty), at x + sx * (y + sy * z). */
  cells: Uint8Array;
  /** 256 RGBA colours; colour of index i (1..255) at (i - 1) * 4. Alpha < 255 = see-through (steam). */
  palette: Uint8Array;
}

/** The model, or null if this is not a readable .vox file. */
export function readVox(buf: ArrayBuffer): VoxModel | null {
  const v = new DataView(buf);
  const tag = (p: number) => String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3));
  if (buf.byteLength < 20 || tag(0) !== 'VOX ' || tag(8) !== 'MAIN') return null;
  let size: [number, number, number] | null = null;
  let xyzi: number | null = null;
  let rgba: number | null = null;
  // MAIN's children follow its 12-byte header (+ its content, normally empty)
  let p = 8 + 12 + v.getInt32(12, true);
  while (p + 12 <= buf.byteLength) {
    const id = tag(p);
    const n = v.getInt32(p + 4, true);
    const children = v.getInt32(p + 8, true);
    const c = p + 12;
    if (n < 0 || children < 0 || c + n > buf.byteLength) return null;
    if (id === 'SIZE' && !size) size = [v.getInt32(c, true), v.getInt32(c + 4, true), v.getInt32(c + 8, true)];
    else if (id === 'XYZI' && xyzi === null) xyzi = c;
    else if (id === 'RGBA') rgba = c;
    p = c + n + children;
  }
  if (!size || xyzi === null) return null;
  const [sx, sy, sz] = size;
  if (sx < 1 || sy < 1 || sz < 1 || sx > 256 || sy > 256 || sz > 256) return null;
  const count = v.getInt32(xyzi, true);
  if (count < 0 || xyzi + 4 + count * 4 > buf.byteLength) return null;
  const cells = new Uint8Array(sx * sy * sz);
  const bytes = new Uint8Array(buf);
  for (let k = 0; k < count; k++) {
    const q = xyzi + 4 + k * 4;
    const x = bytes[q], y = bytes[q + 1], z = bytes[q + 2], i = bytes[q + 3];
    if (x < sx && y < sy && z < sz && i) cells[x + sx * (y + sy * z)] = i;
  }
  const palette = new Uint8Array(1024);
  if (rgba !== null && rgba + 1024 <= buf.byteLength) palette.set(bytes.subarray(rgba, rgba + 1024));
  else for (let i = 0; i < 256; i++) palette.set([200, 200, 200, 255], i * 4); // no palette: grey
  return { sx, sy, sz, cells, palette };
}
