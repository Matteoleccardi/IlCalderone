#!/usr/bin/env python3
"""Dish kit: builds a small voxel model of a dish (with its cutlery on the table) from a short description, and renders
the recipe's pictures from it, so the picture and the 3D model on the website always match.
Used by the recipe-importer agent; the format of dish.json is documented in .claude/agents/recipe-importer.md (step 4).

  build SPEC.json [--out DIR]
      SPEC.json (dish.json) -> DIR/model.vox   the voxel model (MagicaVoxel .vox; open and edit it in MagicaVoxel)
                               DIR/icon.png    the 8-bit icon: the dish seen at 35 degrees, no cutlery (128x128)
                               DIR/photo.png   the recipe picture: the whole table seen from above (1024x768)
                               DIR/preview.png four 3/4 views, to check the model
      DIR defaults to the folder of SPEC.json.
  render MODEL.vox [--out DIR]
      The same pictures from an existing (perhaps hand-edited) .vox.

Palette convention (kept by MagicaVoxel when editing): slots 200-239 are cutlery (left out of the icon),
240-255 are steam (drawn see-through on the website).
"""
from __future__ import annotations

import argparse
import json
import math
import random
import struct
import sys
from pathlib import Path

from PIL import Image

CUTLERY_SLOTS = range(200, 240)
STEAM_SLOTS = range(240, 256)

METALS = {
    "silver": ("#c9cdd5", "#eef1f6", "#99a0ab"),
    "gold": ("#d6a640", "#f4d57e", "#a77a25"),
    "steel": ("#9ba2a9", "#c6ccd2", "#6e757d"),
}
CHOPSTICK = ("#2a2321", "#3e3431", "#1c1716")  # black lacquered wood
TOOLS = ("fork", "knife", "spoon", "teaspoon", "chopsticks")


# ------------------------------------------------------------------ colours and noise

def rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def mul(c, f):
    return tuple(max(0, min(255, round(v * f))) for v in c[:3])


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def lighter(c, t=0.25):
    return mix(c, (255, 255, 255), t)


def hash3(x, y, z, seed=0) -> float:
    """Deterministic 0..1 per cell."""
    h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535


def value_noise(x: float, y: float, seed: int, scale: float) -> float:
    """Smooth 2D noise in -1..1."""
    x, y = x / scale, y / scale
    x0, y0 = math.floor(x), math.floor(y)
    fx, fy = x - x0, y - y0
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    n = lambda i, j: hash3(i, j, 7, seed) * 2 - 1
    a = n(x0, y0) + (n(x0 + 1, y0) - n(x0, y0)) * sx
    b = n(x0, y0 + 1) + (n(x0 + 1, y0 + 1) - n(x0, y0 + 1)) * sx
    return a + (b - a) * sy


# ------------------------------------------------------------------ the voxel grid

class Grid:
    """Sparse voxels: (x, y, z) -> (r, g, b, kind); kind = "" | "cutlery" | "steam". x right, y back, z up."""

    def __init__(self):
        self.v: dict[tuple[int, int, int], tuple] = {}
        self.zoff = 0  # added to every z (the dish stands on a board: 1)

    def put(self, x, y, z, c, kind="", over=True):
        x, y, z = round(x), round(y), round(z) + self.zoff
        if z < 0:
            return
        if over or (x, y, z) not in self.v:
            self.v[(x, y, z)] = (*c[:3], kind)

    def get(self, x, y, z):
        return self.v.get((x, y, z))

    def top(self, x, y) -> int:
        """Height of the column (highest solid z + 1), 0 if empty."""
        return self._tops.get((x, y), 0) if hasattr(self, "_tops") else 0

    def index_tops(self):
        self._tops = {}
        for (x, y, z), c in self.v.items():
            if c[3] != "steam":
                self._tops[(x, y)] = max(self._tops.get((x, y), 0), z + 1)

    def bounds(self):
        xs = [p[0] for p in self.v]
        ys = [p[1] for p in self.v]
        zs = [p[2] for p in self.v]
        return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)


# ------------------------------------------------------------------ containers

def texture(c, x, y, z, seed, amount=0.05):
    """A faint per-voxel variation, so big surfaces don't look flat."""
    h = hash3(x, y, z, seed)
    return mul(c, 1 - amount) if h < 0.25 else mul(c, 1 + amount) if h > 0.8 else c


def build_container(g: Grid, spec: dict, cx: int, cy: int, R: float, seed: int):
    """Returns (floor_z, inner_radius, rim_z, inside): where the food starts, how wide it may spread, the container's
    top, and inside(z) = the room inside the container at height z (the food never pokes through the walls)."""
    kind = spec.get("type", "plate")
    base = rgb(spec.get("color", "#f4ece0"))
    rim = rgb(spec["rim"]) if spec.get("rim") else lighter(base, 0.18)
    inner = rgb(spec["inner"]) if spec.get("inner") else mul(base, 0.93)
    pattern = spec.get("pattern") or {}
    pcol = rgb(pattern["color"]) if pattern.get("color") else None
    ri = int(R) + 2

    def disc(z, r_out, r_in, col, extra=None):
        for x in range(cx - ri, cx + ri + 1):
            for y in range(cy - ri, cy + ri + 1):
                d = math.hypot(x - cx, y - cy)
                if r_in <= d < r_out:
                    c = extra(x, y, z, d) if extra else col
                    g.put(x, y, z, texture(c, x, y, z, seed))

    def wall_pattern(x, y, z, d, col, height):
        if not pcol:
            return col
        a = math.atan2(y - cy, x - cx)
        if pattern.get("type") == "dots" and (z % 3 == 1) and (int((a + math.pi) / (2 * math.pi) * R * 2.2 + (z // 3) * 0.5) % 3 == 0):
            return pcol
        if pattern.get("type") == "band" and z in (height - 3, height - 2):
            return pcol
        if pattern.get("type") == "stripes" and int((a + math.pi) / (2 * math.pi) * R * 1.6) % 2 == 0 and z < height - 1:
            return pcol
        return col

    if kind in ("plate", "deep_plate"):
        deep = kind == "deep_plate"
        disc(0, R * 0.62, 0, mul(base, 0.85))                      # foot
        disc(1, R, 0, inner)                                         # body / well floor
        well = R * (0.7 if deep else 0.8)
        disc(2, R, well, base)                                       # the flat rim
        if deep:
            disc(3, R, R - 1.6, rim)
        else:
            disc(2, R, R - 1.4, rim)
        return 2, well - 0.5, 3 if deep else 2, lambda z: R - 1.5
    if kind in ("bowl", "pot"):
        h = max(5, round(R * (0.85 if kind == "bowl" else 0.75)))

        def outer(z):
            if kind == "bowl":
                return R * (0.5 + 0.5 * math.sin(min(1, z / h * 1.15) * math.pi / 2)) if z else R * 0.48
            return R * 0.9 if z else R * 0.82
        for z in range(h + 1):
            r_out = outer(z)
            r_in = 0 if z <= 1 else r_out - 1.7
            col = rim if z == h else base
            disc(z, r_out, r_in, col, lambda x, y, zz, d, col=col: (
                col if zz == h else inner if d < r_out - 1.2 and zz > 1 else wall_pattern(x, y, zz, d, col, h)))
        if kind == "pot":  # two handles
            hc = rgb(spec.get("handle", spec.get("rim", "#c9a982")))
            for side in (-1, 1):
                for k in range(3):
                    for z in (h - 2, h - 1):
                        x = cx + side * (round(R * 0.9) + 1 + k)
                        for y in (cy - 1, cy, cy + 1):
                            if k < 2 or z == h - 1:
                                g.put(x, y, z, hc)
        return 2, (R * 0.9 if kind == "pot" else R) - 2.2, h, lambda z: outer(min(h, z)) - 1.8
    if kind == "pan":
        h = 3
        for z in range(h + 1):
            disc(z, R, 0 if z == 0 else R - 1.4, rim if z == h else base)
        hc = rgb(spec.get("handle", "#3b2b25"))
        for k in range(round(R * 0.9)):
            for y in (cy - 1, cy, cy + 1):
                g.put(cx + round(R) + 1 + k, y, 2 if k < 3 else 3, texture(hc, k, y, 2, seed))
        return 1, R - 1.8, h, lambda z: R - 1.5
    if kind == "board":
        w, d = R, R * 0.72
        for x in range(cx - round(w), cx + round(w) + 1):
            for y in range(cy - round(d), cy + round(d) + 1):
                if (abs(x - cx) / w) ** 4 + (abs(y - cy) / d) ** 4 <= 1:
                    for z in (0, 1):
                        grain = 0.93 if (y + int(value_noise(x, 0, seed, 3) * 2)) % 3 == 0 else 1
                        g.put(x, y, z, mul(base if z else mul(base, 0.85), grain))
        return 2, min(w, d) * 0.85, 1, lambda z: min(w, d)
    raise SystemExit(f"unknown container type {kind!r} (plate, deep_plate, bowl, pot, pan, board)")


# ------------------------------------------------------------------ filling

def build_filling(g: Grid, spec: dict, cx, cy, floor, radius, rim_z, inside, seed):
    """Fills from the container floor to a surface; returns surface(x, y) -> z of the top food voxel, or None."""
    shape = spec.get("shape", "dome")
    tex = spec.get("texture", "smooth")
    cols = [rgb(c) for c in (spec.get("colors") or [spec.get("color", "#e8c986")])]
    level = spec.get("level")
    depth = max(1, rim_z - floor)
    base_h = floor + (round(level * depth) if level is not None else (depth - 1 if shape == "flat" else max(1, depth // 2)))
    dome = spec.get("height", 5 if shape == "dome" else 7 if shape == "heap" else 0)
    surf = {}
    ri = int(radius) + 1
    for x in range(cx - ri, cx + ri + 1):
        for y in range(cy - ri, cy + ri + 1):
            d = math.hypot(x - cx, y - cy)
            if d > radius:
                continue
            t = d / radius
            h = base_h
            if shape in ("dome", "heap"):
                h += dome * (1 - t ** (2 if shape == "dome" else 1.3))
            amp = {"smooth": 0.4, "ripples": 0.5, "grain": 0.8, "pieces": 1.4, "strands": 1.0, "leaves": 2.2}.get(tex, 0.6)
            h += value_noise(x, y, seed, 2.5) * amp
            if tex == "pieces":  # each piece a lump: some stand higher, the gaps between them dip
                h += cell_id(x, y, seed, 2.6) * 1.6 - (0.7 if voronoi_edge(x, y, seed, 2.6) < 0.18 else 0)
            top = max(floor, round(h))
            surf[(x, y)] = top
            for z in range(floor, top + 1):
                if d > inside(z) and z <= rim_z:
                    continue  # the container is narrower here (a bowl's foot)
                c = pick_color(cols, tex, x, y, z, top, seed)
                g.put(x, y, z, c)
    return surf


def pick_color(cols, tex, x, y, z, top, seed):
    main = cols[0]
    alt = cols[1] if len(cols) > 1 else mul(main, 0.85)
    third = cols[2] if len(cols) > 2 else lighter(main, 0.2)
    if z < top:
        return mul(main, 0.9)
    if tex == "pieces":  # cell pattern: each piece a patch, darker where pieces meet
        cell = voronoi_edge(x, y, seed, 2.6)
        return alt if cell < 0.18 else third if hash3(x // 2, y // 2, 1, seed) > 0.8 else main
    if tex == "strands":
        v = math.sin((x + value_noise(x, y, seed, 4) * 5) * 1.3 + y * 0.35)
        return alt if v < -0.55 else third if v > 0.75 else main
    if tex == "grain":
        h = hash3(x, y, z, seed)
        return third if h > 0.72 else alt if h < 0.15 else main
    if tex == "leaves":
        n = value_noise(x, y, seed + 3, 2.2)
        return alt if n < -0.25 else third if n > 0.35 else main
    if tex == "ripples":
        return third if hash3(x, y, 3, seed) > 0.93 else alt if hash3(x, y, 4, seed) > 0.9 else main
    return texture(main, x, y, z, seed, 0.03)


def cell_id(x, y, seed, size):
    """0..1, the same for every point of one piece (the nearest feature point)."""
    gx, gy = math.floor(x / size), math.floor(y / size)
    best = None
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            px = (gx + i + hash3(gx + i, gy + j, 11, seed)) * size
            py = (gy + j + hash3(gx + i, gy + j, 13, seed)) * size
            d = math.hypot(x - px, y - py)
            if best is None or d < best[0]:
                best = (d, hash3(gx + i, gy + j, 17, seed))
    return best[1]


def voronoi_edge(x, y, seed, size):
    """Distance between the nearest two feature points (small = near an edge between pieces)."""
    gx, gy = math.floor(x / size), math.floor(y / size)
    ds = []
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            px = (gx + i + hash3(gx + i, gy + j, 11, seed)) * size
            py = (gy + j + hash3(gx + i, gy + j, 13, seed)) * size
            ds.append(math.hypot(x - px, y - py))
    ds.sort()
    return (ds[1] - ds[0]) / size


# ------------------------------------------------------------------ toppings

def build_toppings(g: Grid, items: list, cx, cy, surf: dict, radius, seed):
    rnd = random.Random(seed * 31 + 5)
    placed: list[tuple[float, float, float]] = []
    for n_item, t in enumerate(items):
        kind = t.get("type", "cube")
        col = rgb(t.get("color", "#ff8a1f"))
        col2 = rgb(t["color2"]) if t.get("color2") else None
        size = max(1, int(t.get("size", 2)))
        count = int(t.get("count", 6))
        spread = float(t.get("spread", 0.75))
        if kind == "crumb":
            for _ in range(count):
                x, y = disc_point(rnd, cx, cy, radius * spread)
                z = surf.get((round(x), round(y)))
                if z is not None:
                    g.put(x, y, z + 1, col if rnd.random() > 0.3 else (col2 or mul(col, 0.8)))
            continue
        for _ in range(count):
            for _try in range(30):
                x, y = disc_point(rnd, cx, cy, radius * spread)
                if all(math.hypot(x - px, y - py) >= (size + ps) * 0.6 for px, py, ps in placed):
                    break
            placed.append((x, y, size))
            z0 = max(surf.get((round(x + dx), round(y + dy)), -99) for dx in (-1, 0, 1) for dy in (-1, 0, 1))
            if z0 < 0:
                continue
            put_topping(g, kind, round(x), round(y), z0 + 1, size, col, col2, rnd, seed + n_item)


def disc_point(rnd, cx, cy, r):
    a = rnd.random() * math.tau
    d = math.sqrt(rnd.random()) * r
    return cx + math.cos(a) * d, cy + math.sin(a) * d


def put_topping(g: Grid, kind, x, y, z, s, col, col2, rnd, seed):
    hi = lighter(col, 0.22)
    if kind == "cube":
        for i in range(s):
            for j in range(s):
                for k in range(s):
                    g.put(x + i, y + j, z + k, hi if k == s - 1 else col)
    elif kind == "ball":
        r = s / 2
        for i in range(-s, s + 1):
            for j in range(-s, s + 1):
                for k in range(0, s + 1):
                    if (i * i + j * j + (k - r + 0.5) ** 2) <= r * r + 0.3:
                        g.put(x + i, y + j, z + k, hi if k >= r else col)
    elif kind == "floret":  # broccoli / cauliflower: a stem and a bumpy crown
        stem = col2 or lighter(col, 0.35)
        for k in range(max(1, s // 2)):
            g.put(x, y, z + k, stem)
        r = s * 0.75 + 0.5
        cz = z + max(1, s // 2) + r * 0.6
        for i in range(-s - 1, s + 2):
            for j in range(-s - 1, s + 2):
                for k in range(-s, s + 2):
                    d = math.sqrt(i * i + j * j + (k * 1.2) ** 2)
                    if d <= r + (hash3(x + i, y + j, int(cz) + k, seed) - 0.5) * 0.9:
                        g.put(x + i, y + j, cz + k, hi if k >= r * 0.4 and hash3(i, j, k, seed) > 0.4 else col)
    elif kind == "leaf":  # basil / spinach / mint: a flat oval, slightly tilted, with a vein
        a = rnd.random() * math.pi
        L, W = s + 1.5, (s + 1) / 2
        vein = col2 or mul(col, 0.78)
        for i in range(-s - 2, s + 3):
            for j in range(-s - 2, s + 3):
                u = i * math.cos(a) + j * math.sin(a)
                v = -i * math.sin(a) + j * math.cos(a)
                if (u / L) ** 2 + (v / W) ** 2 <= 1:
                    g.put(x + i, y + j, z + (1 if u > L * 0.3 else 0), vein if abs(v) < 0.5 else hi if v > 0 else col)
    elif kind == "sprig":  # a standing herb sprig
        stem = col2 or mul(col, 0.7)
        for k in range(s + 1):
            g.put(x, y, z + k, stem)
        for k, (dx, dy) in enumerate([(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1)]):
            g.put(x + dx, y + dy, z + s - (k // 2), col if k % 2 else hi)
        g.put(x, y, z + s + 1, hi)
    elif kind == "slice":  # a round slice lying flat: lemon, mushroom, zucchini
        rim = col2 or mul(col, 0.8)
        r = s / 2 + 0.5
        for i in range(-s, s + 1):
            for j in range(-s, s + 1):
                d = math.hypot(i, j)
                if d <= r:
                    g.put(x + i, y + j, z, rim if d > r - 1 else col)
    elif kind == "strip":  # bacon, pepper or carrot strips
        a = rnd.random() * math.pi
        for k in range(-s, s + 1):
            g.put(x + k * math.cos(a), y + k * math.sin(a), z, col if k % 3 else (col2 or hi))
    elif kind == "dollop":  # a blob of sauce, pesto, cream
        r = s + 0.5
        for i in range(-s - 1, s + 2):
            for j in range(-s - 1, s + 2):
                for k in range(0, s):
                    if (i * i + j * j) / (r * r) + (k / max(1, s * 0.6)) ** 2 <= 1:
                        g.put(x + i, y + j, z + k, hi if k == s - 1 or (i * i + j * j) < 2 else col)
    else:
        raise SystemExit(f"unknown topping type {kind!r} (cube, ball, floret, leaf, sprig, slice, strip, dollop, crumb)")


def build_steam(g: Grid, spec, cx, cy, surf, radius, seed):
    col = rgb(spec.get("color", "#ece9f7")) if isinstance(spec, dict) else (236, 233, 247)
    rnd = random.Random(seed + 99)
    top = max(surf.values()) if surf else 4
    for k in range(3):
        x0 = cx + (k - 1) * radius * 0.45 + rnd.uniform(-1, 1)
        y0 = cy + rnd.uniform(-radius * 0.3, radius * 0.3)
        for step in range(7):
            if rnd.random() < 0.25:
                continue
            x = x0 + math.sin(step * 0.9 + k) * 1.3
            g.put(x, y0, top + 3 + step, col, "steam")


# ------------------------------------------------------------------ cutlery

def build_tool(g: Grid, tool: str, x0: int, y0: int, L: int, metal: str):
    """One tool lying on the table, handle towards the front (low y), head to the back. x0 = its left edge."""
    base, hi, lo = (rgb(c) for c in (CHOPSTICK if tool == "chopsticks" else METALS[metal]))
    K = "cutlery"
    put = lambda x, y, z, c: g.put(x, y, z, c, K)
    if tool == "chopsticks":
        for s in (0, 4):
            for k in range(L):
                y = y0 + k
                x = x0 + s + (1 if s == 0 and k > L * 0.55 else 0) - (1 if s == 4 and k > L * 0.55 else 0)
                put(x, y, 0, hi if k % 5 == 0 else base)
                if k < L * 0.35:
                    put(x, y, 1, lo if k % 4 == 0 else base)
        return 5
    if tool == "knife":
        hl = round(L * 0.45)
        for k in range(L):
            y = y0 + k
            if k < hl:
                for i in (0, 1):
                    put(x0 + i, y, 0, lo if i else base)
                put(x0, y, 1, hi if k % 3 else base)
            else:
                w = 3 if k < L - 3 else 2 if k < L - 1 else 1
                for i in range(w):
                    put(x0 + i, y, 0, hi if i == 0 else base)
        return 3
    if tool == "fork":
        hl = round(L * 0.58)
        for k in range(hl):
            for i in (1, 2):
                put(x0 + i, y0 + k, 0, base if i == 1 else lo)
            if k < hl * 0.7:
                put(x0 + 1, y0 + k, 1, hi)
        head = L - hl
        for k in range(head):
            y = y0 + hl + k
            if k < 3:
                for i in range(5):
                    put(x0 + i - (1 if k == 0 and i in (0, 4) else 0) * 0, y, 0, hi if i == 2 else base)
            else:
                for i in (0, 2, 4):
                    put(x0 + i, y, 0, hi if i == 2 else base)
        return 5
    if tool in ("spoon", "teaspoon"):
        if tool == "teaspoon":
            L = round(L * 0.72)
        bw, bl = (5, 7) if tool == "spoon" else (3, 5)
        hl = L - bl
        cxs = x0 + bw // 2
        for k in range(hl):
            put(cxs, y0 + k, 0, base)
            if k < hl * 0.6:
                put(cxs, y0 + k, 1, hi)
                if tool == "spoon":
                    put(cxs + 1, y0 + k, 0, lo)
        for i in range(bw):
            for k in range(bl):
                u = (i - (bw - 1) / 2) / (bw / 2)
                v = (k - (bl - 1) / 2) / (bl / 2)
                if u * u + v * v <= 1.05:
                    edge = u * u + v * v > 0.45
                    put(x0 + i, y0 + hl + k, 0, lo if not edge else base)
                    if edge:
                        put(x0 + i, y0 + hl + k, 1, hi if u < 0 else base)
        return bw
    raise SystemExit(f"unknown tool {tool!r} ({', '.join(TOOLS)})")


# ------------------------------------------------------------------ the whole table

def build(spec: dict) -> Grid:
    seed = int(spec.get("seed", 1))
    size = int(spec.get("size", 36))
    R = size / 2
    cutlery = spec.get("cutlery") or {}
    tools = [t for t in cutlery.get("tools", []) if t]
    for t in tools:
        if t not in TOOLS:
            raise SystemExit(f"unknown tool {t!r} ({', '.join(TOOLS)})")
    metal = cutlery.get("metal", "silver")
    if metal not in METALS:
        raise SystemExit(f"unknown metal {metal!r} ({', '.join(METALS)})")
    L = max(16, round(size * 0.8))
    left = [t for t in tools if t == "fork"]
    right = [t for t in ("knife", "spoon", "teaspoon", "chopsticks") if t in tools]
    width = {"fork": 5, "knife": 3, "spoon": 5, "teaspoon": 3, "chopsticks": 5}
    gap = 2
    left_w = sum(width[t] + gap for t in left)
    margin = 2
    handles = 4 if spec.get("container", {}).get("type") == "pot" else 0
    pan = round(R * 0.9) + 2 if spec.get("container", {}).get("type") == "pan" else 0
    cx = margin + left_w + handles + round(R)
    cy = margin + max(round(R), (L + 1) // 2)
    g = Grid()
    under = spec.get("under")
    if under:  # a board, tray or placemat under the dish
        uc = rgb(under.get("color", "#c98a4b"))
        ur = R + float(under.get("margin", 3))
        for x in range(cx - round(ur), cx + round(ur) + 1):
            for y in range(cy - round(ur), cy + round(ur) + 1):
                if math.hypot(x - cx, y - cy) <= ur:
                    grain = 0.92 if (y + int(value_noise(x, 0, seed, 3) * 2)) % 3 == 0 else 1
                    g.put(x, y, 0, mul(uc, grain))
    g.zoff = 1 if under else 0
    floor, radius, rim_z, inside = build_container(g, spec.get("container", {}), cx, cy, R, seed)
    surf = build_filling(g, spec.get("filling", {}), cx, cy, floor, radius, rim_z, inside, seed)
    build_toppings(g, spec.get("toppings", []), cx, cy, surf, radius, seed)
    if spec.get("steam"):
        build_steam(g, spec["steam"], cx, cy, surf, radius, seed)
    g.zoff = 0
    # cutlery: the fork on the left, the rest on the right, centred front to back
    ty = cy - L // 2
    x = margin
    for t in left:
        build_tool(g, t, x, ty, L, metal)
        x += width[t] + gap
    x = cx + round(R) + 1 + gap + handles + pan
    if under:
        x = max(x, cx + round(R + float(under.get("margin", 3))) + 1 + gap)
    for t in right:
        build_tool(g, t, x, ty, L, metal)
        x += width[t] + gap
    return g


# ------------------------------------------------------------------ .vox

def to_vox(g: Grid) -> tuple[bytes, dict]:
    """MagicaVoxel .vox bytes; the grid is moved to start at 0 and hollowed (hidden voxels dropped)."""
    x0, x1, y0, y1, z0, z1 = g.bounds()
    sx, sy, sz = x1 - x0 + 1, y1 - y0 + 1, z1 + 1
    if max(sx, sy, sz) > 256:
        raise SystemExit("model larger than 256 voxels")
    pal: dict[tuple, int] = {}
    slots = {"": iter(range(1, 200)), "cutlery": iter(CUTLERY_SLOTS), "steam": iter(STEAM_SLOTS)}
    solid = {p for p, c in g.v.items() if c[3] != "steam"}
    xyzi = []
    for (x, y, z), c in sorted(g.v.items()):
        if c[3] != "steam" and all((x + dx, y + dy, z + dz) in solid for dx, dy, dz in
                                   ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))):
            continue  # hidden inside
        key = c
        if key not in pal:
            try:
                pal[key] = next(slots[c[3]])
            except StopIteration:
                # palette full: reuse the closest colour of the same kind
                same = [k for k in pal if k[3] == c[3]]
                pal[key] = pal[min(same, key=lambda k: sum((k[i] - c[i]) ** 2 for i in range(3)))]
        xyzi.append(struct.pack("4B", x - x0, y - y0, z, pal[key]))
    rgba = bytearray(1024)
    for c, i in pal.items():
        rgba[(i - 1) * 4:(i - 1) * 4 + 4] = bytes((c[0], c[1], c[2], 140 if c[3] == "steam" else 255))
    chunk = lambda tag, content: tag + struct.pack("<ii", len(content), 0) + content
    children = (chunk(b"SIZE", struct.pack("<iii", sx, sy, sz))
                + chunk(b"XYZI", struct.pack("<i", len(xyzi)) + b"".join(xyzi))
                + chunk(b"RGBA", bytes(rgba)))
    data = b"VOX " + struct.pack("<i", 150) + b"MAIN" + struct.pack("<ii", 0, len(children)) + children
    return data, {"size": (sx, sy, sz), "voxels": len(xyzi), "colours": len(set(pal.values()))}


def read_vox(path) -> Grid:
    """A .vox (first model) back into a Grid, kinds taken from the palette slots."""
    b = Path(path).read_bytes()
    if b[:4] != b"VOX " or b[8:12] != b"MAIN":
        raise SystemExit(f"{path}: not a .vox file")
    p = 20 + struct.unpack("<i", b[12:16])[0]
    xyzi, pal = None, None
    while p + 12 <= len(b):
        tag = b[p:p + 4]
        n, ch = struct.unpack("<ii", b[p + 4:p + 12])
        c = p + 12
        if tag == b"XYZI" and xyzi is None:
            xyzi = b[c:c + n]
        elif tag == b"RGBA":
            pal = b[c:c + n]
        p = c + n + ch
    g = Grid()
    count = struct.unpack("<i", xyzi[:4])[0]
    for k in range(count):
        x, y, z, i = xyzi[4 + k * 4:8 + k * 4]
        col = tuple(pal[(i - 1) * 4:(i - 1) * 4 + 3]) if pal else (200, 200, 200)
        kind = "cutlery" if i in CUTLERY_SLOTS else "steam" if i in STEAM_SLOTS else ""
        g.v[(x, y, z)] = (*col, kind)
    return g


# ------------------------------------------------------------------ pictures

def render_top(g: Grid, W=1024, H=768, fill=0.92) -> Image.Image:
    """The table from straight above, as pixel art: one square per voxel column, with soft shadows and no outline.
    Framed like the website's 3D view from above (dish-scene.ts: FILL, centred on the model)."""
    g.index_tops()
    x0, x1, y0, y1, _, _ = g.bounds()
    sx, sy = x1 - x0 + 1, y1 - y0 + 1
    cell = max(1, math.floor(fill * min(W / sx, H / sy)))
    small = Image.new("RGBA", (sx + 2, sy + 2), (0, 0, 0, 0))
    px = small.load()
    tops: dict[tuple[int, int], tuple] = {}
    for (x, y, z), c in g.v.items():
        if c[3] == "steam":
            continue
        if z + 1 == g.top(x, y):
            tops[(x, y)] = (z, c)
    for (x, y), (z, c) in tops.items():
        col = mul(c, 1 + 0.012 * z)
        # shadow from the light at the left-front (lower x, lower y; y grows to the back = up in the picture)
        for k in (1, 2, 3):
            if g.top(x - k, y - k) > z + 1 + k * 0.9:
                col = mul(col, 0.8)
                break
        # a darker edge where the surface drops (gives the relief from above)
        if any(g.top(x + dx, y + dy) < z - 1 for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1))):
            col = mul(col, 0.88)
        px[x - x0 + 1, sy - (y - y0)] = (*col, 255)
    # steam drawn lightly over the top
    for (x, y, z), c in g.v.items():
        if c[3] == "steam":
            q = (x - x0 + 1, sy - (y - y0))
            old = px[q]
            px[q] = (*mix(old[:3], c[:3], 0.6), 255) if old[3] else (*c[:3], 150)
    img = small.resize((small.width * cell, small.height * cell), Image.NEAREST)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # centre the model (not the outline border) like the 3D camera does
    out.alpha_composite(img, (round(W / 2 - (sx / 2 + 1) * cell), round(H / 2 - (sy / 2 + 1) * cell)))
    return out


def render_angle(g: Grid, res=64, elev=40, azim=0, skip=("cutlery",), fill=0.9) -> Image.Image:
    """The model seen at an angle (orthographic, from the front by default), ray-cast at res×res pixels."""
    pts = [p for p, c in g.v.items() if c[3] not in skip]
    if not pts:
        return Image.new("RGBA", (res, res), (0, 0, 0, 0))
    e, a = math.radians(elev), math.radians(azim)
    d = (math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), -math.sin(e))       # view direction
    right = (math.cos(a), -math.sin(a), 0.0)
    up = (math.sin(a) * math.sin(e), math.cos(a) * math.sin(e), math.cos(e))
    dot = lambda p, q: p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
    us = [dot((x + .5, y + .5, z + .5), right) for x, y, z in pts]
    vs = [dot((x + .5, y + .5, z + .5), up) for x, y, z in pts]
    u0, u1, v0, v1 = min(us) - 1, max(us) + 1, min(vs) - 1, max(vs) + 1
    scale = fill * res / max(u1 - u0, v1 - v0)
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    vox = {p: c for p, c in g.v.items() if c[3] not in skip}
    x0, x1, y0, y1, z0, z1 = g.bounds()
    centre = ((x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2, (z0 + z1 + 1) / 2)
    far = (x1 - x0) + (y1 - y0) + (z1 - z0) + 10
    light = norm((-0.55, -0.45, 0.7))
    img = Image.new("RGBA", (res, res), (0, 0, 0, 0))
    px = img.load()
    depth: dict[tuple[int, int], float] = {}
    for j in range(res):
        for i in range(res):
            u = uc + (i + 0.5 - res / 2) / scale
            v = vc - (j + 0.5 - res / 2) / scale
            o = [centre[k] + right[k] * (u - dot(centre, right)) + up[k] * (v - dot(centre, up)) - d[k] * far for k in range(3)]
            hit = cast(o, d, vox, far * 2)
            if hit:
                c, n, steam, t = hit
                if steam is not None and c is None:
                    px[i, j] = (*steam, 140)
                    continue
                f = 0.5 + 0.5 * max(0, dot(n, light)) + (0.1 if n[2] > 0 else 0)
                col = mul(c, f)
                if steam is not None:
                    col = mix(col, steam, 0.45)
                px[i, j] = (*col, 255)
                depth[i, j] = t
    # no outlines (the owner's choice): only a soft shade of the pixel's own colour where a shape stands in front of
    # something farther away, so the parts stay readable at icon size
    edges = []
    for (i, j), t in depth.items():
        for di, dj in ((1, 0), (0, 1), (-1, 0), (0, -1)):
            t2 = depth.get((i + di, j + dj))
            if t2 is not None and t2 - t > 2.5 * res / 64:
                edges.append((i + di, j + dj))
    for q in set(edges):
        c = px[q]
        px[q] = (*mul(c[:3], 0.85), 255)
    return img


def norm(v):
    l = math.sqrt(sum(x * x for x in v))
    return tuple(x / l for x in v)


def cast(o, d, vox, maxt):
    """Amanatides–Woo walk through the grid: first solid voxel -> (colour, face normal, steam colour seen before)."""
    x, y, z = (math.floor(o[k]) for k in range(3))
    step = [1 if d[k] > 0 else -1 if d[k] < 0 else 0 for k in range(3)]
    tmax, tdelta = [], []
    for k in range(3):
        if d[k] == 0:
            tmax.append(math.inf)
            tdelta.append(math.inf)
        else:
            nb = math.floor(o[k]) + (1 if d[k] > 0 else 0)
            tmax.append((nb - o[k]) / d[k])
            tdelta.append(abs(1 / d[k]))
    normal = (0, 0, 1)
    steam = None
    t = 0
    while t < maxt:
        c = vox.get((x, y, z))
        if c:
            if c[3] == "steam":
                steam = steam or c[:3]
            else:
                return c[:3], normal, steam, t
        k = 0 if tmax[0] < tmax[1] and tmax[0] < tmax[2] else 1 if tmax[1] < tmax[2] else 2
        t = tmax[k]
        tmax[k] += tdelta[k]
        if k == 0:
            x += step[0]
        elif k == 1:
            y += step[1]
        else:
            z += step[2]
        normal = tuple(-step[i] if i == k else 0 for i in range(3))
    return (None, None, steam, t) if steam else None


def write_outputs(g: Grid, out: Path, vox: bool = True):
    out.mkdir(parents=True, exist_ok=True)
    if vox:
        data, info = to_vox(g)
        if len(data) > 262144:
            raise SystemExit(f"model.vox would be {len(data)} bytes; the website accepts at most 262144 (use a smaller size)")
        (out / "model.vox").write_bytes(data)
        print(f"wrote {out / 'model.vox'}: {info['size'][0]}x{info['size'][1]}x{info['size'][2]}, "
              f"{info['voxels']} voxels, {info['colours']} colours, {len(data)} bytes")
    icon = render_angle(g, 64).resize((128, 128), Image.NEAREST)
    icon.save(out / "icon.png", optimize=True)
    print(f"wrote {out / 'icon.png'} ({(out / 'icon.png').stat().st_size} bytes)")
    photo = render_top(g)
    photo.save(out / "photo.png", optimize=True)
    print(f"wrote {out / 'photo.png'} ({(out / 'photo.png').stat().st_size} bytes)")
    views = [render_angle(g, 160, 32, a, skip=()) for a in (0, 90, 180, 270)]
    sheet = Image.new("RGBA", (160 * 4 + 64 * 2, 160), (255, 255, 255, 255))
    for k, im in enumerate(views):
        sheet.alpha_composite(im, (160 * k, 0))
    sheet.alpha_composite(render_angle(g, 64).resize((128, 128), Image.NEAREST), (640, 16))
    sheet.save(out / "preview.png")
    print(f"wrote {out / 'preview.png'} (four views of the table + the icon): look at it")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("spec")
    b.add_argument("--out")
    r = sub.add_parser("render")
    r.add_argument("model")
    r.add_argument("--out")
    a = ap.parse_args()
    if a.cmd == "build":
        spec = json.loads(Path(a.spec).read_text(encoding="utf-8"))
        write_outputs(build(spec), Path(a.out) if a.out else Path(a.spec).parent)
    else:
        write_outputs(read_vox(a.model), Path(a.out) if a.out else Path(a.model).parent, vox=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
