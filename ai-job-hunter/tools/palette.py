#!/usr/bin/env python3
"""Generate the AI Job Hunter colour system.

How the big design systems do it, applied here:
- Scales are built in OKLCH (Tailwind v4, Linear, Evil Martians), whose
  lightness matches perceived brightness, so every hue at the same step looks
  equally light (Stripe's "consistent visual weight").
- Each hue gets 12 steps with fixed jobs (Radix): 1-2 backgrounds, 3-5
  component fills (rest / hover / pressed), 6-8 borders, 9-10 solid fills
  (rest / hover), 11 secondary text, 12 primary text.
- Gray is tinted with the brand hue at very low chroma.
- Dark mode has its own scales, not an inversion: surfaces get lighter as they
  rise, large areas lose chroma, accents get lighter.
- Every pair the UI relies on is checked against WCAG 2.2 (4.5:1 text,
  3:1 UI parts) in both themes. The script fails if one does not pass.

Usage: python3 tools/palette.py   (rewrites the palette block in styles.css)
"""
import math
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSS = ROOT / "styles.css"

# Brand: "Vora blue", sampled from the Vora logo (OKLCH hue 255-265, chroma
# about 0.2: a vivid royal blue that shades from sky to indigo). As the big
# product companies do (Stripe, Linear, Apple), the brand colour is used
# sparingly for actions, links, focus and selection, on calm neutrals tinted
# with the same hue; the logo's sky-to-indigo gradient is kept for one hero
# accent, never for buttons or text.
BRAND_HUE = 264

# Lightness per step. Light: near-white backgrounds down to near-black text.
# Dark: deep backgrounds up to near-white text. Step 9 is set per hue.
L_LIGHT = [0.994, 0.982, 0.962, 0.942, 0.919, 0.890, 0.846, 0.665, None, None, 0.475, 0.255]
L_DARK = [0.170, 0.198, 0.236, 0.266, 0.297, 0.336, 0.392, 0.545, None, None, 0.810, 0.945]

# Chroma as a share of the hue's peak, per step (peaks at 9-10, tapers to the ends).
C_LIGHT = [0.06, 0.12, 0.22, 0.30, 0.38, 0.46, 0.56, 0.70, 1.00, 1.00, 0.86, 0.48]
C_DARK = [0.14, 0.18, 0.26, 0.32, 0.38, 0.45, 0.54, 0.66, 1.00, 1.00, 0.62, 0.28]

# name: (hue, peak chroma, step-9 L light, step-9 L dark, text on solid)
HUES = {
    "gray":   (BRAND_HUE, 0.014, 0.560, 0.560, "light"),
    "brand":  (BRAND_HUE, 0.205, 0.500, 0.560, "light"),
    # success leans yellow-green so it does not read as the brand
    "green":  (140,       0.140, 0.540, 0.600, "light"),
    "amber":  (72,        0.150, 0.800, 0.800, "dark"),
    "red":    (27,        0.190, 0.555, 0.600, "light"),
    # category / status hues (game categories, tracker stages)
    "violet": (292,       0.160, 0.540, 0.600, "light"),
    "cyan":   (222,       0.120, 0.560, 0.640, "light"),
    "pink":   (350,       0.170, 0.570, 0.640, "light"),
    "teal":   (178,       0.110, 0.560, 0.640, "light"),
}


# --- OKLCH -> sRGB -----------------------------------------------------------
def oklch_to_linear(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    return (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )


def in_gamut(rgb):
    return all(-1e-4 <= c <= 1 + 1e-4 for c in rgb)


def to_hex(L, C, h):
    """Gamut-map by lowering chroma (keeps lightness and hue), then encode."""
    lo, hi = 0.0, C
    if not in_gamut(oklch_to_linear(L, C, h)):
        for _ in range(30):
            mid = (lo + hi) / 2
            if in_gamut(oklch_to_linear(L, mid, h)):
                lo = mid
            else:
                hi = mid
        C = lo
    rgb = oklch_to_linear(L, C, h)
    enc = lambda c: 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    return "#" + "".join(f"{round(min(1, max(0, enc(c))) * 255):02x}" for c in rgb)


def luminance(hexc):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hexc[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


# --- Build scales -----------------------------------------------------------
def scale(name, dark):
    hue, peak, l9_light, l9_dark, _ = HUES[name]
    Ls = list(L_DARK if dark else L_LIGHT)
    Cs = C_DARK if dark else C_LIGHT
    l9 = l9_dark if dark else l9_light
    Ls[8] = l9
    Ls[9] = l9 - (0.035 if dark else 0.045)  # hover: a touch darker, so white labels keep contrast
    if name == "amber":  # yellow-ish hues stay light at 9-10 and darken more for text
        Ls[9] = l9 - 0.04
        if not dark:
            Ls[10] = 0.50
    out = []
    for i in range(12):
        c = peak * Cs[i]
        if name == "gray":
            c = peak * (0.35 + 0.65 * Cs[i])  # keep the tint even at the ends
            if dark:
                c *= 1.9  # navy-black like the logo's background, not grey-black
        out.append(to_hex(Ls[i], c, hue))
    return out


LIGHT = {n: scale(n, False) for n in HUES}
DARK = {n: scale(n, True) for n in HUES}

# --- Semantic roles -----------------------------------------------------------
# Same names in both themes; dark mode maps a few roles to different steps
# (elevation: surfaces get lighter as they rise).
SEMANTIC_LIGHT = {
    "--bg": "var(--gray-2)",
    "--surface": "#ffffff",
    "--surface-raised": "#ffffff",
    "--surface-2": "var(--gray-3)",
    "--surface-hover": "var(--gray-4)",
    "--surface-active": "var(--gray-5)",
    "--border": "var(--gray-6)",
    "--border-strong": "var(--gray-8)",
    "--text": "var(--gray-12)",
    "--text-2": "var(--gray-11)",
    "--muted": "var(--gray-11)",
    "--accent": "var(--brand-9)",
    "--accent-hover": "var(--brand-10)",
    "--accent-text": "var(--brand-11)",
    "--accent-soft": "var(--brand-3)",
    "--accent-soft-2": "var(--brand-5)",
    "--accent-border": "var(--brand-7)",
    "--accent-2": "var(--brand-12)",
    "--on-accent": "#ffffff",
    "--focus": "var(--brand-9)",
    "--ok": "var(--green-11)",
    "--ok-solid": "var(--green-9)",
    "--ok-soft": "var(--green-3)",
    "--warn": "var(--amber-11)",
    "--warn-solid": "var(--amber-9)",
    "--warn-soft": "var(--amber-3)",
    "--danger": "var(--red-11)",
    "--danger-solid": "var(--red-9)",
    "--danger-soft": "var(--red-3)",
    "--star": "var(--amber-9)",
    "--s-saved": "var(--violet-11)",
    "--s-applied": "var(--cyan-11)",
    "--s-interview": "var(--amber-11)",
    "--s-offer": "var(--green-11)",
    "--s-rejected": "var(--gray-11)",
    "--cat-story": "var(--violet-11)",
    "--cat-skills": "var(--cyan-11)",
    "--cat-motivation": "var(--pink-11)",
    "--cat-fit": "var(--teal-11)",
    "--cat-curve": "var(--amber-11)",
    "--stage": "var(--gray-5)",
    "--shadow-color": "230 35% 20%",
}
SEMANTIC_DARK = {
    **SEMANTIC_LIGHT,
    "--bg": "var(--gray-1)",
    "--surface": "var(--gray-2)",
    "--surface-raised": "var(--gray-3)",
    "--surface-2": "var(--gray-3)",
    "--surface-hover": "var(--gray-4)",
    "--surface-active": "var(--gray-5)",
    "--border": "var(--gray-5)",
    "--border-strong": "var(--gray-8)",
    "--stage": "var(--gray-1)",
    "--shadow-color": "230 50% 2%",
}


def resolve(value, scales):
    m = re.fullmatch(r"var\(--(\w+)-(\d+)\)", value)
    return scales[m.group(1)][int(m.group(2)) - 1] if m else value


# --- Contrast checks ------------------------------------------------------------
# (foreground role, background role, minimum ratio, what it is)
CHECKS = [
    ("--text", "--bg", 7.0, "primary text on page"),
    ("--text", "--surface", 7.0, "primary text on cards"),
    ("--text-2", "--surface", 4.5, "secondary text on cards"),
    ("--text-2", "--bg", 4.5, "secondary text on page"),
    ("--text-2", "--surface-2", 4.5, "secondary text on fills"),
    ("--accent-text", "--surface", 4.5, "links on cards"),
    ("--accent-text", "--accent-soft", 4.5, "accent text on tinted panels"),
    ("--on-accent", "--accent", 4.5, "button label on primary button"),
    ("--on-accent", "--accent-hover", 4.5, "button label on hovered primary button"),
    ("--ok", "--ok-soft", 4.5, "success text on success tint"),
    ("--warn", "--warn-soft", 4.5, "warning text on warning tint"),
    ("--danger", "--danger-soft", 4.5, "error text on error tint"),
    ("--danger", "--surface", 4.5, "error text on cards"),
    ("--s-saved", "--surface", 4.5, "status label: saved"),
    ("--s-applied", "--surface", 4.5, "status label: applied"),
    ("--s-interview", "--surface", 4.5, "status label: interview"),
    ("--cat-motivation", "--surface", 4.5, "category label"),
    ("--cat-fit", "--surface", 4.5, "category label"),
    ("--border-strong", "--surface", 3.0, "input borders (WCAG 1.4.11)"),
    ("--focus", "--surface", 3.0, "focus ring"),
    ("--focus", "--bg", 3.0, "focus ring on page"),
    ("--star", "--surface", 1.8, "star icons (decorative, paired with a number)"),
]


def check(theme, scales, semantic):
    rows, failed = [], 0
    for fg, bg, minimum, label in CHECKS:
        a, b = resolve(semantic[fg], scales), resolve(semantic[bg], scales)
        ratio = contrast(a, b)
        ok = ratio >= minimum
        failed += not ok
        rows.append(f"| {theme} | {label} | `{a}` on `{b}` | {ratio:.2f} | {minimum} | {'pass' if ok else 'FAIL'} |")
    return rows, failed


rows_l, fail_l = check("light", LIGHT, SEMANTIC_LIGHT)
rows_d, fail_d = check("dark", DARK, SEMANTIC_DARK)
report = ["| Theme | Pair | Colours | Ratio | Needs | Result |", "| --- | --- | --- | --- | --- | --- |", *rows_l, *rows_d]
(ROOT / "tools" / "contrast-report.md").write_text(
    "# Contrast report\n\nGenerated by `tools/palette.py`. Every colour pair the UI relies on, checked against WCAG 2.2.\n\n"
    + "\n".join(report) + "\n"
)
print("\n".join(report))
if fail_l or fail_d:
    sys.exit(f"\n{fail_l + fail_d} contrast checks failed; palette not written.")


# --- Write CSS -------------------------------------------------------------------
def block(scales, semantic, indent):
    lines = []
    for name, steps in scales.items():
        lines.append(indent + " ".join(f"--{name}-{i + 1}: {c};" for i, c in enumerate(steps)))
    lines += [f"{indent}{k}: {v};" for k, v in semantic.items()]
    return "\n".join(lines)


css = f"""/* palette:start (generated by tools/palette.py; edit the script, not this block) */
:root {{
{block(LIGHT, SEMANTIC_LIGHT, '  ')}
  color-scheme: light;
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
{block(DARK, SEMANTIC_DARK, '    ')}
    color-scheme: dark;
  }}
}}
:root[data-theme="dark"] {{
{block(DARK, SEMANTIC_DARK, '  ')}
  color-scheme: dark;
}}
/* palette:end */"""

text = CSS.read_text()
if "/* palette:start" in text:
    text = re.sub(r"/\* palette:start.*?/\* palette:end \*/", lambda _: css, text, flags=re.S)
else:
    text = css + "\n\n" + text
CSS.write_text(text)
print(f"\nAll {len(CHECKS) * 2} checks pass. Wrote palette to {CSS.relative_to(ROOT)}.")
