"""Write the colour themes, web/src/themes/<pack>/<variant>.css + index.css, from the official palettes below.

Each palette is mapped onto Il Calderone's colour tokens. A colour is changed only when it is too faint to read
(WCAG AA, 4.5:1 on every background it is drawn on, see PAIRS): it is then darkened (light themes) or lightened (dark
themes) just enough, which keeps its hue; the change is written in the file's header comment.
tests/test_themes.py re-checks the generated files.
It also writes web/src/themes/themes.ts, the list the app shows (do not edit that file by hand).

Usage: python tools/make_themes.py [THEMES_DIR]   (prints the contrast report)"""
import sys
from pathlib import Path

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'web' / 'src' / 'themes'

# Catppuccin 1.7.1 (https://github.com/catppuccin/palette), the colours used here
CATPPUCCIN = {
    'latte': {'base': '#eff1f5', 'mantle': '#e6e9ef', 'crust': '#dce0e8', 'surface0': '#ccd0da', 'surface1': '#bcc0cc', 'text': '#4c4f69', 'subtext0': '#6c6f85', 'peach': '#fe640b', 'green': '#40a02b', 'red': '#d20f39'},
    'frappe': {'base': '#303446', 'mantle': '#292c3c', 'crust': '#232634', 'surface0': '#414559', 'surface1': '#51576d', 'text': '#c6d0f5', 'subtext0': '#a5adce', 'peach': '#ef9f76', 'green': '#a6d189', 'red': '#e78284'},
    'macchiato': {'base': '#24273a', 'mantle': '#1e2030', 'crust': '#181926', 'surface0': '#363a4f', 'surface1': '#494d64', 'text': '#cad3f5', 'subtext0': '#a5adcb', 'peach': '#f5a97f', 'green': '#a6da95', 'red': '#ed8796'},
    'mocha': {'base': '#1e1e2e', 'mantle': '#181825', 'crust': '#11111b', 'surface0': '#313244', 'surface1': '#45475a', 'text': '#cdd6f4', 'subtext0': '#a6adc8', 'peach': '#fab387', 'green': '#a6e3a1', 'red': '#f38ba8'},
}


def ctp(flavor, name):
    return CATPPUCCIN[flavor][name]


def rgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def hexs(c):
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(x))) for x in c)


def mix(a, b, t):  # t of b into a
    A, B = rgb(a), rgb(b); return hexs([A[i] * (1 - t) + B[i] * t for i in range(3)])


def lum(h):
    def ch(c):
        c /= 255; return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb(h); return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)


def push(color, against, target, toward):
    """Mix `color` toward `toward` until it reaches `target` contrast with every colour in `against`."""
    for i in range(51):
        c = mix(color, toward, i / 50)
        if all(contrast(c, x) >= target for x in against):
            return c
    return toward


THEMES = []


def theme(pack, variant, name, kind, *, bg, surface, surface2, line, text, muted, accent, ok, danger, source):
    THEMES.append(dict(pack=pack, variant=variant, name=name, kind=kind, bg=bg, surface=surface, surface2=surface2,
                       line=line, text=text, muted=muted, accent=accent, ok=ok, danger=danger, source=source))


# ---- Calderone (the original look, kept exactly)
CALDERONE = {
    'light': dict(bg='#faf6f0', surface='#ffffff', surface2='#f3ece2', text='#2b211b', muted='#7a6a5e', line='#e6dccf',
                  accent='#b5532f', accent_text='#ffffff', accent_soft='#f6e3d8', ok='#3f7d4e', danger='#b3261e',
                  shadow='0 1px 2px rgb(60 40 20 / 6%), 0 4px 16px rgb(60 40 20 / 6%)'),
    'dark': dict(bg='#1c1714', surface='#26201b', surface2='#2f2722', text='#f1e8df', muted='#b0a196', line='#3d332c',
                 accent='#e0855a', accent_text='#1c1714', accent_soft='#3e2a20', ok='#7cc48d', danger='#ff8a80',
                 shadow='none'),
}

# ---- Dispensa (the default look, docs/design.md): pantry green-grey, saffron for the one main action
DISPENSA = {
    'light': dict(bg='#f2f4ec', surface='#e6ebdb', surface2='#d9e1cb', text='#1b2a1c', muted='#4d5c4a', line='#c3cdb4',
                  line_strong='#6f7d66', accent='#2b6a1d', accent_text='#ffffff', accent_soft='#d6e6c6', ok='#2b6a1d',
                  danger='#a7231b', primary='#f2b01e', primary_text='#1b2a1c', shadow='none'),
    'dark': dict(bg='#121212', surface='#1d1d1d', surface2='#272727', text='#f1eee6', muted='#a9a59b', line='#333333',
                 line_strong='#7a7a7a', accent='#9ad36b', accent_text='#121212', accent_soft='#2a3a1f', ok='#9ad36b',
                 danger='#ff8f80', primary='#f2b01e', primary_text='#121212', shadow='none'),
}

# ---- Catppuccin (MIT, https://github.com/catppuccin/palette)
for fl, nm, kind in [('latte', 'Latte', 'light'), ('frappe', 'Frappé', 'dark'), ('macchiato', 'Macchiato', 'dark'),
                     ('mocha', 'Mocha', 'dark')]:
    p = lambda n: ctp(fl, n)
    if kind == 'light':
        theme('catppuccin', fl, nm, kind, bg=p('mantle'), surface=p('base'), surface2=p('crust'), line=p('surface0'),
              text=p('text'), muted=p('subtext0'), accent=p('peach'), ok=p('green'), danger=p('red'),
              source='Catppuccin palette 1.7.1')
    else:
        theme('catppuccin', fl, nm, kind, bg=p('mantle'), surface=p('base'), surface2=p('surface0'), line=p('surface1'),
              text=p('text'), muted=p('subtext0'), accent=p('peach'), ok=p('green'), danger=p('red'),
              source='Catppuccin palette 1.7.1')

# ---- Rosé Pine (MIT, https://rosepinetheme.com/palette)
theme('rose-pine', 'dawn', 'Dawn', 'light', bg='#faf4ed', surface='#fffaf3', surface2='#f2e9e1', line='#dfdad9',
      text='#575279', muted='#797593', accent='#d7827e', ok='#286983', danger='#b4637a', source='Rosé Pine palette 4.0.1')
theme('rose-pine', 'moon', 'Moon', 'dark', bg='#232136', surface='#2a273f', surface2='#393552', line='#44415a',
      text='#e0def4', muted='#908caa', accent='#ea9a97', ok='#9ccfd8', danger='#eb6f92', source='Rosé Pine palette 4.0.1')
theme('rose-pine', 'main', 'Rosé Pine', 'dark', bg='#191724', surface='#1f1d2e', surface2='#26233a', line='#403d52',
      text='#e0def4', muted='#908caa', accent='#ebbcba', ok='#9ccfd8', danger='#eb6f92', source='Rosé Pine palette 4.0.1')

# ---- Gruvbox (MIT, https://github.com/morhetz/gruvbox)
theme('gruvbox', 'light', 'Gruvbox Light', 'light', bg='#fbf1c7', surface='#f9f5d7', surface2='#ebdbb2', line='#d5c4a1',
      text='#3c3836', muted='#7c6f64', accent='#af3a03', ok='#79740e', danger='#9d0006', source='Gruvbox (morhetz)')
theme('gruvbox', 'dark', 'Gruvbox Dark', 'dark', bg='#1d2021', surface='#282828', surface2='#3c3836', line='#504945',
      text='#ebdbb2', muted='#a89984', accent='#fe8019', ok='#b8bb26', danger='#fb4934', source='Gruvbox (morhetz)')

# ---- Nord (MIT, https://www.nordtheme.com)
theme('nord', 'light', 'Snow Storm', 'light', bg='#e5e9f0', surface='#eceff4', surface2='#d8dee9', line='#d8dee9',
      text='#2e3440', muted='#4c566a', accent='#5e81ac', ok='#a3be8c', danger='#bf616a', source='Nord palette')
theme('nord', 'dark', 'Polar Night', 'dark', bg='#2e3440', surface='#3b4252', surface2='#434c5e', line='#4c566a',
      text='#e5e9f0', muted=mix('#d8dee9', '#4c566a', 0.3), accent='#88c0d0', ok='#a3be8c', danger='#bf616a',
      source='Nord palette')

# ---- Solarized (MIT, https://ethanschoonover.com/solarized)
theme('solarized', 'light', 'Solarized Light', 'light', bg='#eee8d5', surface='#fdf6e3', surface2='#eee8d5',
      line=mix('#eee8d5', '#93a1a1', 0.35), text='#073642', muted='#586e75', accent='#cb4b16', ok='#859900',
      danger='#dc322f', source='Solarized')
theme('solarized', 'dark', 'Solarized Dark', 'dark', bg='#002b36', surface='#073642', surface2=mix('#073642', '#586e75', 0.25),
      line='#586e75', text='#93a1a1', muted='#839496', accent='#cb4b16', ok='#859900', danger='#dc322f', source='Solarized')

# ---- Everforest medium (MIT, https://github.com/sainnhe/everforest)
theme('everforest', 'light', 'Everforest Light', 'light', bg='#efebd4', surface='#fdf6e3', surface2='#f4f0d9',
      line='#e6e2cc', text='#5c6a72', muted='#829181', accent='#f57d26', ok='#8da101', danger='#f85552',
      source='Everforest palette (medium)')
theme('everforest', 'dark', 'Everforest Dark', 'dark', bg='#232a2e', surface='#2d353b', surface2='#343f44',
      line='#475258', text='#d3c6aa', muted='#9da9a0', accent='#e69875', ok='#a7c080', danger='#e67e80',
      source='Everforest palette (medium)')


# Share of the accent mixed into the card colour to make --accent-soft (generated themes)
SOFT = {'light': 0.16, 'dark': 0.22}
MIN_SOFT = 6  # percent: the faintest tint worth showing

# What the gate guarantees (also re-checked by tests/test_themes.py): text colour -> backgrounds it is drawn on.
# Muted text on --accent-soft is not enforced: it only appears on the selected row of the recipe history.
PAIRS = [('text', ('bg', 'surface', 'surface2', 'accent_soft')), ('muted', ('bg', 'surface', 'surface2')),
         ('accent', ('bg', 'surface', 'surface2', 'accent_soft')), ('ok', ('bg', 'surface', 'surface2')),
         ('danger', ('bg', 'surface', 'surface2')), ('accent_text', ('accent',)), ('on_danger', ('danger',)),
         ('placeholder', ('bg', 'surface', 'surface2')), ('primary_text', ('primary',))]
# Borders of controls and icons need 3:1 (WCAG 1.4.11), not 4.5:1.
UI_PAIRS = [('line_strong', ('bg', 'surface'))]


def gate(t, soft=None):
    """Nudge text, muted, accent, ok and danger until each reads at 4.5:1 on the backgrounds in PAIRS.
    The accent also has to read on its own soft tint, which is mixed from it (unless `soft` is given): try ever
    darker (light themes) or lighter (dark themes) accents until both hold. Returns the colours and what changed."""
    notes = []
    kind = t['kind']
    edge = '#ffffff' if kind == 'dark' else '#000000'
    bg, sf, s2 = t['bg'], t['surface'], t['surface2']
    surfaces = (bg, sf, s2)

    def fix(name, color, against):
        new = push(color, against, 4.5, edge)
        if new != color: notes.append(f'{name} {color} -> {new}')
        return new

    muted = fix('muted', t['muted'], surfaces)
    ok = fix('ok', t['ok'], surfaces)
    danger = fix('danger', t['danger'], surfaces)
    # keep the accent as it is and make its soft tint fainter first; only when even a faint tint is not enough, move the accent
    accent, share = edge, None
    for i in range(51):
        c = mix(t['accent'], edge, i / 50)
        if not all(contrast(c, x) >= 4.5 for x in surfaces):
            continue
        shares = [None] if soft else [x / 100 for x in range(round(SOFT[kind] * 100), MIN_SOFT - 1, -2)]
        hit = next((x for x in shares if contrast(c, soft or mix(sf, c, x)) >= 4.5), 'none')
        if hit != 'none':
            accent, share = c, hit
            break
    soft = soft or mix(sf, accent, share if share is not None else MIN_SOFT / 100)
    if accent != t['accent']: notes.append(f"accent {t['accent']} -> {accent}")
    if share is not None and share != SOFT[kind]: notes.append(f"accent-soft tint {SOFT[kind]:.0%} -> {share:.0%}")
    text = fix('text', t['text'], surfaces + (soft,))
    return dict(text=text, muted=muted, ok=ok, danger=danger, accent=accent, accent_soft=soft), notes


def extras(tok, dark):
    """Tokens added with the Dispensa redesign, derived for themes that do not set them: the main button takes the
    accent, borders of controls are the divider colour pushed toward the text until 3:1, placeholders are the muted text."""
    tok.setdefault('primary', tok['accent'])
    tok.setdefault('primary_text', tok['accent_text'])
    tok.setdefault('line_strong', push(tok['line'], (tok['bg'], tok['surface']), 3.0, tok['text']))
    tok.setdefault('placeholder', tok['muted'])
    return tok


def build(t):
    """Token values for one theme; colours are only nudged when needed for readability (noted in the file)."""
    dark = t['kind'] == 'dark'
    bg, sf = t['bg'], t['surface']
    g, notes = gate(t)
    text, accent = g['text'], g['accent']
    # text on accent buttons: the theme's own dark/light colour that reads best
    cands = [bg, sf, text, '#ffffff', '#000000'] if not dark else [bg, sf, '#000000']
    acc_text = max(cands, key=lambda c: contrast(c, accent))
    if contrast(acc_text, accent) < 4.5:
        notes.append(f'accent-text contrast only {contrast(acc_text, accent):.2f}')
    on_danger = max([bg, sf, '#ffffff', '#000000'], key=lambda c: contrast(c, g['danger']))
    line = t['line']
    shadow = 'none' if dark else f'0 1px 2px rgb({" ".join(map(str, rgb(text)))} / 7%), 0 4px 16px rgb({" ".join(map(str, rgb(text)))} / 6%)'
    tokens = dict(bg=bg, surface=sf, surface2=t['surface2'], text=text, muted=g['muted'], line=line, accent=accent,
                  accent_text=acc_text, accent_soft=g['accent_soft'], ok=g['ok'], danger=g['danger'], shadow=shadow)
    extras(tokens, dark)
    return tokens, on_danger, notes


def css(tid, kind, tok, on_danger, header):
    names = [('bg', 'bg'), ('surface', 'surface'), ('surface2', 'surface-2'), ('text', 'text'), ('muted', 'muted'),
             ('line', 'line'), ('accent', 'accent'), ('accent_text', 'accent-text'), ('accent_soft', 'accent-soft'),
             ('ok', 'ok'), ('danger', 'danger'), ('shadow', 'shadow'), ('primary', 'primary'),
             ('primary_text', 'primary-text'), ('line_strong', 'line-strong'), ('placeholder', 'placeholder')]
    body = '\n'.join(f'  --{css_name}: {tok[k]};' for k, css_name in names)
    backdrop = 'rgb(0 0 0 / 45%)' if kind == 'light' else 'rgb(0 0 0 / 60%)'
    return (f'{header}\n[data-theme="{tid}"] {{\n{body}\n  --on-danger: {on_danger};\n  --backdrop: {backdrop};\n'
            f'  color-scheme: {kind};\n}}\n')


reg = []
report = []
for pack, pack_name, palettes, intro in (('dispensa', 'Dispensa', DISPENSA, 'the default look (docs/design.md)'),
                                         ('calderone', 'Calderone', CALDERONE, 'the original Il Calderone look')):
    for kind in ('light', 'dark'):
        c = palettes[kind]
        tid = f'{pack}-{kind}'
        on_danger = c.get('on_danger') or ('#ffffff' if pack == 'calderone' and kind == 'light' else
                                           '#1c1714' if pack == 'calderone' else
                                           '#ffffff' if kind == 'light' else '#121212')
        g, notes = gate(dict(c, kind=kind), soft=c['accent_soft'])
        tok = extras(dict(c, **g), kind == 'dark')
        header = f'/* {pack_name} ({kind}): {intro}'
        header += '; nudged for readability (WCAG AA): ' + '; '.join(notes) + '. */' if notes else '. */'
        (OUT / pack).mkdir(parents=True, exist_ok=True)
        (OUT / pack / f'{kind}.css').write_text(css(tid, kind, tok, on_danger, header))
        reg.append((tid, pack_name, pack_name, kind))
        report.append((tid, dict(tok, on_danger=on_danger), notes))

for t in THEMES:
    tid = f"{t['pack']}-{t['variant']}"
    tok, on_danger, notes = build(t)
    header = f"/* {t['name']} ({t['source']}, MIT licence). Mapped onto Il Calderone's colour tokens"
    header += '; nudged for readability (WCAG AA): ' + '; '.join(notes) + '. */' if notes else '. */'
    (OUT / t['pack']).mkdir(parents=True, exist_ok=True)
    (OUT / t['pack'] / f"{t['variant']}.css").write_text(css(tid, t['kind'], tok, on_danger, header))
    pack_name = {'catppuccin': 'Catppuccin', 'rose-pine': 'Rosé Pine', 'gruvbox': 'Gruvbox', 'nord': 'Nord',
                 'solarized': 'Solarized', 'everforest': 'Everforest'}[t['pack']]
    reg.append((tid, pack_name, t['name'], t['kind']))
    report.append((tid, dict(tok, on_danger=on_danger), notes))

# index.css + registry
(OUT / 'index.css').write_text('/* Every theme. Generated list: keep it in sync with themes.ts. */\n' + ''.join(
    f'@import "./{tid.split("-", 1)[0] if not tid.startswith("rose-pine") else "rose-pine"}/{tid.removeprefix("rose-pine-") if tid.startswith("rose-pine") else tid.split("-", 1)[1]}.css";\n'
    for tid, *_ in reg))
ts = ['// Generated by tools/make_themes.py: do not edit by hand.',
      '/** A colour theme: its CSS is web/src/themes/<pack>/<variant>.css, applied by [data-theme="<id>"]. */',
      "export interface ThemeInfo {\n  id: string;\n  pack: string;\n  name: string;\n  kind: 'light' | 'dark';\n}", '',
      'export const THEMES: readonly ThemeInfo[] = [']
ts += [f"  {{ id: '{tid}', pack: '{pack}', name: '{name}', kind: '{kind}' }}," for tid, pack, name, kind in reg]
ts += ['];', '', "export const DEFAULT_LIGHT = 'dispensa-light';", "export const DEFAULT_DARK = 'dispensa-dark';", '']
(OUT / 'themes.ts').write_text('\n'.join(ts))

for tid, tok, notes in report:
    worst = min(contrast(tok[fg], tok[bg]) for fg, bgs in PAIRS for bg in bgs)
    ui = min(contrast(tok[fg], tok[bg]) for fg, bgs in UI_PAIRS for bg in bgs)
    print(f'{tid:24} worst {worst:4.2f}  borders {ui:4.2f}  ' + ('; '.join(notes) if notes else 'as published'))
