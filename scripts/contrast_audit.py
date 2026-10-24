"""Audit the Institutional Light palette: does every text colour hold WCAG AA on its canvas?

Run this after ANY change to tokens.css. Light canvases are deceptive -- a navy that looks
quiet on white can fail the moment the same caption sits in a hovered or selected row, and
eyeballing will not catch it. Add new text tokens to TEXT and new ramps to the on-fill loop.

Parses oklch(L C H [/ A]) triples straight out of tokens.css, converts OKLCH -> linear sRGB ->
sRGB, and computes WCAG 2.1 contrast ratios for the pairs that actually carry text.
No deps beyond the stdlib.
"""
import math
import re
import pathlib

# Resolved relative to this file, so the audit runs from any working directory.
TOKENS = pathlib.Path(__file__).resolve().parent.parent / "src" / "theme" / "tokens.css"

OKLCH = re.compile(
    r"--([a-z0-9-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:/\s*([\d.]+)\s*)?\)"
)


def oklch_to_srgb(L, C, H):
    h = math.radians(H)
    a, b = C * math.cos(h), C * math.sin(h)
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    def enc(u):
        u = max(0.0, min(1.0, u))
        return 1.055 * u ** (1 / 2.4) - 0.055 if u > 0.0031308 else 12.92 * u

    return tuple(enc(x) for x in (r, g, bl))


def relative_luminance(rgb):
    def lin(u):
        return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4

    r, g, b = (lin(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg, bg):
    a, b = relative_luminance(fg), relative_luminance(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


tok = {}
for name, L, C, H, A in OKLCH.findall(TOKENS.read_text(encoding="utf-8")):
    if A is None or A == "":  # skip alpha washes: they composite, not stand alone
        tok[name] = oklch_to_srgb(float(L), float(C), float(H))

BACKDROPS = {
    "surface-0 (white plate)": "surface-0",
    "surface-void (canvas)": "surface-void",
    "surface-2 (hover row)": "surface-2",
}

# text colours that must stay readable
TEXT = [
    "ink", "ink-muted", "ink-faint", "ink-ghost",
    "accent", "accent-hover", "accent-quiet",
    "ok", "warn", "warn-ink", "danger", "info",
    "cat-1", "cat-2", "cat-3", "cat-4", "cat-5", "cat-6", "cat-7", "cat-8",
]

print("=" * 74)
print("TEXT CONTRAST  (AA normal >= 4.5, AA large/UI >= 3.0)")
print("=" * 74)
worst = []
for label, bgname in BACKDROPS.items():
    bg = tok.get(bgname)
    if bg is None:
        continue
    print(f"\n-- on {label}")
    for name in TEXT:
        if name not in tok:
            continue
        r = contrast(tok[name], bg)
        mark = "PASS-AA " if r >= 4.5 else ("large/UI" if r >= 3.0 else "FAIL    ")
        print(f"   {name:<16} {r:5.2f}  {mark}")
        if r < 3.0:
            worst.append((label, name, r))

print("\n" + "=" * 74)
print("ON-FILL INK  (label sitting on its own ramp bin)")
print("=" * 74)
for ramp, bins in (("seq", 6),):
    print(f"\n-- {ramp}")
    for i in range(bins):
        fill, ink = f"{ramp}-{i}", f"{ramp}-{i}-ink"
        if fill in tok and ink in tok:
            r = contrast(tok[ink], tok[fill])
            mark = "PASS-AA " if r >= 4.5 else ("large/UI" if r >= 3.0 else "FAIL    ")
            print(f"   {fill:<12} + ink   {r:5.2f}  {mark}")
            if r < 4.5:
                worst.append((fill, ink, r))

print("\n" + "=" * 74)
print("HAIRLINES / NON-TEXT  (>= 3.0 wanted for meaningful boundaries)")
print("=" * 74)
for name in ("line-faint", "line", "line-strong"):
    if name in tok:
        r = contrast(tok[name], tok["surface-0"])
        print(f"   {name:<14} on white  {r:5.2f}")

print("\n" + "=" * 74)
if worst:
    print(f"{len(worst)} PROBLEM(S):")
    for a, b, r in worst:
        print(f"   {a} / {b} = {r:.2f}")
else:
    print("No failures: every text token clears 3.0, every on-fill ink clears 4.5.")
