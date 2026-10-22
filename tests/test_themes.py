"""Every colour theme keeps its text readable (WCAG AA, 4.5:1) on the backgrounds it is drawn on.

Parses the generated files (web/src/themes/<pack>/<variant>.css), so a hand edit or a new theme that gets too faint
fails here. The list of pairs mirrors PAIRS in tools/make_themes.py; muted text on --accent-soft is not enforced
(it only appears on the selected row of the recipe history). No server needed."""
import re
from pathlib import Path

import pytest

THEMES_DIR = Path(__file__).resolve().parent.parent / "web" / "src" / "themes"
THEMES = sorted(THEMES_DIR.glob("*/*.css"))

# text colour -> the backgrounds it is drawn on
PAIRS = [
    ("text", ("bg", "surface", "surface-2", "accent-soft")),
    ("muted", ("bg", "surface", "surface-2")),
    ("accent", ("bg", "surface", "surface-2", "accent-soft")),
    ("ok", ("bg", "surface", "surface-2")),
    ("danger", ("bg", "surface", "surface-2")),
    ("accent-text", ("accent",)),
    ("on-danger", ("danger",)),
    ("placeholder", ("bg", "surface", "surface-2")),
    ("primary-text", ("primary",)),
]
# borders of controls: 3:1 (WCAG 1.4.11)
UI_PAIRS = [("line-strong", ("bg", "surface")), ("lens", ("primary",))]


def luminance(hex_colour: str) -> float:
    def channel(c: int) -> float:
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (int(hex_colour[i : i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast(a: str, b: str) -> float:
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def tokens(css: Path) -> dict:
    return dict(re.findall(r"--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});", css.read_text(encoding="utf-8")))


def test_every_listed_theme_has_a_file():
    """themes.ts is the list the app shows: each entry needs its CSS file, so none escapes the check below."""
    listed = re.findall(r"id: '([a-z-]+)'", (THEMES_DIR / "themes.ts").read_text(encoding="utf-8"))
    files = {f"{p.parent.name}-{p.stem}" for p in THEMES}
    assert listed and set(listed) == files


@pytest.mark.parametrize("css", THEMES, ids=lambda p: f"{p.parent.name}-{p.stem}")
def test_theme_text_is_readable(css):
    t = tokens(css)
    low = [
        f"{fg} on {bg}: {contrast(t[fg], t[bg]):.2f}"
        for fg, bgs in PAIRS
        for bg in bgs
        if contrast(t[fg], t[bg]) < 4.5
    ]
    assert not low, "below 4.5:1 -> " + "; ".join(low)


@pytest.mark.parametrize("css", THEMES, ids=lambda p: f"{p.parent.name}-{p.stem}")
def test_theme_control_borders_are_visible(css):
    t = tokens(css)
    low = [f"{fg} on {bg}: {contrast(t[fg], t[bg]):.2f}" for fg, bgs in UI_PAIRS for bg in bgs if contrast(t[fg], t[bg]) < 3.0]
    assert not low, "below 3:1 -> " + "; ".join(low)
