#!/usr/bin/env python3
"""Pictures for new recipes (used by the recipe-importer agent, .claude/agents/recipe-importer.md).

  crop COVER.png OUT.jpg [--top 0.134 --bottom 0.592]
      Dish photo only, from a recipe-app cover screenshot: drops the status bar and buttons above, and the white title
      card below (the fractions fit the iPhone app used so far; check the result and adjust them for other apps).
      Resized to at most 1600 px wide, JPEG quality 85.
  icon ICON.svg [OUT.png]
      Export a pixel-art SVG (viewBox 0 0 32 32, one <rect> per pixel) with Inkscape to a 128x128 PNG without
      anti-aliasing, so every pixel stays crisp (4x). Checks the grid, the size (max 64 KB) and the palette.
  photo ICON.png OUT.png [--width 1024] [--bg "#fff3df"]
      The dish photo made from the icon (instead of a real photo): the pixel art enlarged without blurring and centred
      on a 4:3 canvas, so recipe cards (4:3) show it whole. Transparent background unless --bg is given.
"""
import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image


def cmd_crop(a):
    im = Image.open(a.cover).convert("RGB")
    w, h = im.size
    im = im.crop((0, int(h * a.top), w, int(h * a.bottom)))
    if im.width > 1600:
        im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    im.save(a.out, "JPEG", quality=85, optimize=True)
    print(f"wrote {a.out} ({im.width}x{im.height})")


def cmd_icon(a):
    svg = Path(a.svg)
    out = Path(a.out) if a.out else svg.with_suffix(".png")
    text = svg.read_text(encoding="utf-8")
    problems = []
    if not re.search(r'viewBox="0 0 32 32"', text):
        problems.append('the SVG should have viewBox="0 0 32 32" (one unit = one pixel)')
    for m in re.finditer(r"<rect\b[^>]*>", text):
        for attr in ("x", "y", "width", "height"):
            v = re.search(rf'\b{attr}="([^"]+)"', m.group(0))
            if v and not re.fullmatch(r"\d+", v.group(1)):
                problems.append(f"non-integer {attr}={v.group(1)!r} in {m.group(0)[:60]}… (pixels must sit on the grid)")
                break
    if re.search(r"<(circle|ellipse|path|polygon|line|text)\b", text):
        problems.append("only <rect> pixels are allowed (circles/paths are anti-aliased and lose the 8-bit look)")
    inkscape = shutil.which("inkscape")
    if not inkscape:
        sys.exit("inkscape not found")
    subprocess.run([inkscape, str(svg), "--export-type=png", "--export-width=128", "--export-height=128",
                    "--export-png-antialias=0", "--export-background-opacity=0", f"--export-filename={out}"],
                   check=True, capture_output=True)
    im = Image.open(out)
    colors = im.convert("RGBA").getcolors(1 << 16) or []
    opaque = [c for c in colors if c[1][3] > 0]
    size = out.stat().st_size
    if im.size != (128, 128):
        problems.append(f"PNG is {im.size}, expected 128x128")
    if size > 65536:
        problems.append(f"PNG is {size} bytes, the app accepts at most 65536")
    if len(opaque) > 24:
        problems.append(f"{len(opaque)} colours: keep the palette to about 12-16")
    if len(opaque) < 5:
        problems.append(f"only {len(opaque)} colours: add highlights and shadows to make it lively")
    print(f"wrote {out}: {im.size[0]}x{im.size[1]}, {size} bytes, {len(opaque)} colours")
    for p in problems:
        print("WARN", p)
    return 1 if problems else 0


def cmd_photo(a):
    icon = Image.open(a.icon).convert("RGBA")
    W = a.width
    H = W * 3 // 4
    # enlarge by a whole factor of the 32-pixel grid so every "pixel" stays a sharp square
    cell = max(1, (H * 0.92) // 32)
    art = icon.resize((32, 32), Image.NEAREST).resize((int(32 * cell), int(32 * cell)), Image.NEAREST)
    canvas = Image.new("RGBA", (W, H), a.bg or (0, 0, 0, 0))
    canvas.alpha_composite(art, ((W - art.width) // 2, (H - art.height) // 2))
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    canvas.save(a.out, "PNG", optimize=True)
    print(f"wrote {a.out} ({W}x{H}, {Path(a.out).stat().st_size} bytes)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("crop")
    c.add_argument("cover")
    c.add_argument("out")
    c.add_argument("--top", type=float, default=0.134)
    c.add_argument("--bottom", type=float, default=0.592)
    c.set_defaults(fn=cmd_crop)
    i = sub.add_parser("icon")
    i.add_argument("svg")
    i.add_argument("out", nargs="?")
    i.set_defaults(fn=cmd_icon)
    p = sub.add_parser("photo")
    p.add_argument("icon")
    p.add_argument("out")
    p.add_argument("--width", type=int, default=1024)
    p.add_argument("--bg")
    p.set_defaults(fn=cmd_photo)
    a = ap.parse_args()
    return a.fn(a) or 0


if __name__ == "__main__":
    sys.exit(main())
