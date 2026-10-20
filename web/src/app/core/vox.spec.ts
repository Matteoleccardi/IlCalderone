import { describe, expect, it } from 'vitest';
import { readVox } from './vox';

/** A .vox file built by hand: MAIN with SIZE, XYZI and (optionally) RGBA, like tools/dish_kit.py writes it. */
function vox(size: number[], voxels: number[][], palette?: number[][]): ArrayBuffer {
  const out: number[] = [];
  const i32 = (n: number) => out.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255);
  const tag = (s: string) => [...s].forEach((c) => out.push(c.charCodeAt(0)));
  const kids: number[] = [];
  const chunk = (id: string, body: number[]) => {
    const keep = out.splice(0);
    tag(id);
    i32(body.length);
    i32(0);
    out.push(...body);
    kids.push(...out.splice(0));
    out.push(...keep);
  };
  const le = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  chunk('SIZE', [...le(size[0]), ...le(size[1]), ...le(size[2])]);
  chunk('XYZI', [...le(voxels.length), ...voxels.flat()]);
  if (palette) {
    const rgba = new Array(1024).fill(0);
    palette.forEach((c, k) => rgba.splice(k * 4, 4, ...c));
    chunk('RGBA', rgba);
  }
  tag('VOX ');
  i32(150);
  tag('MAIN');
  i32(0);
  i32(kids.length);
  out.push(...kids);
  return new Uint8Array(out).buffer;
}

describe('readVox', () => {
  it('reads size, voxels and palette', () => {
    const m = readVox(vox([3, 2, 4], [[0, 0, 0, 1], [2, 1, 3, 2]], [[255, 0, 0, 255], [10, 20, 30, 140]]))!;
    expect([m.sx, m.sy, m.sz]).toEqual([3, 2, 4]);
    expect(m.cells[0]).toBe(1);
    expect(m.cells[2 + 3 * (1 + 2 * 3)]).toBe(2);
    expect(m.cells.filter((c) => c).length).toBe(2);
    expect([...m.palette.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(m.palette[7]).toBe(140); // see-through: steam
  });

  it('falls back to grey without a palette and skips voxels outside the size', () => {
    const m = readVox(vox([1, 1, 1], [[0, 0, 0, 5], [4, 0, 0, 1]]))!;
    expect(m.cells.length).toBe(1);
    expect(m.cells[0]).toBe(5);
    expect(m.palette[16]).toBe(200);
  });

  it('rejects other files', () => {
    expect(readVox(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
    expect(readVox(new TextEncoder().encode('VOX \x96\0\0\0NOPE' + '\0'.repeat(20)).buffer)).toBeNull();
  });
});
