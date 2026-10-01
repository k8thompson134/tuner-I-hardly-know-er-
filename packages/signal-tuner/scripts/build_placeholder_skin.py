"""Builds a placeholder Signal Tuner skin by recolouring Webamp's base 2.91
skin into the Atomic Purple palette. Stand-in until the hand-made skin
exists; see docs/desktop-shell-plan.md.

    python3 scripts/build_placeholder_skin.py
"""

from __future__ import annotations

import colorsys
import io
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT.parent / "webamp" / "assets" / "skins" / "base-2.91"
OUT = ROOT / "public" / "skins" / "signal-tuner-placeholder.wsz"

PURPLE_HUE = 268 / 360
AMBER_HUE = 34 / 360
MAGIC_PINK = (255, 0, 255)
# The EQ face is repainted for the game's three sliders. Must match
# EQ_LAYOUT in src/cosmetics.ts (band -> left px; each slider is 14x63 at
# top 38 in the 275x116 EQ window).
EQ_SLIDER_LEFT = {"NOISE": 60, "TUNE": 130, "CLARITY": 200}
SLIDER_TOP, SLIDER_W, SLIDER_H = 38, 14, 63
FACE = (7, 15, 268, 109)  # inner face of EQMAIN, inclusive

FACE_TOP = (70, 46, 100)
FACE_BOTTOM = (48, 30, 72)
GRID_DOT = (82, 56, 116)
WELL = (24, 12, 38)
WELL_DARK = (12, 6, 20)
WELL_LIGHT = (120, 92, 170)
TICK = (150, 122, 205)
LABEL = (200, 180, 240)
DIAL_LABEL = (57, 255, 20)

# 5x6 pixel capitals for the EQ labels, in the spirit of Winamp's TEXT.BMP
# (Pillow can't decode base 2.91's TEXT.BMP, so they're drawn here).
GLYPHS = {
    "A": ["01110", "10001", "11111", "10001", "10001"],
    "C": ["01111", "10000", "10000", "10000", "01111"],
    "E": ["11111", "10000", "11110", "10000", "11111"],
    "G": ["01111", "10000", "10011", "10001", "01111"],
    "I": ["111", "010", "010", "010", "111"],
    "L": ["10000", "10000", "10000", "10000", "11111"],
    "N": ["10001", "11001", "10101", "10011", "10001"],
    "O": ["01110", "10001", "10001", "10001", "01110"],
    "R": ["11110", "10001", "11110", "10010", "10001"],
    "S": ["01111", "10000", "01110", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "01110"],
    "X": ["10001", "01010", "00100", "01010", "10001"],
    "Y": ["10001", "01010", "00100", "00100", "00100"],
}


def text_width(text: str) -> int:
    return sum(len(GLYPHS[c][0]) + 1 if c in GLYPHS else 4 for c in text) - 1


def draw_text(img: Image.Image, text: str, x: int, y: int, color) -> None:
    for ch in text:
        rows = GLYPHS.get(ch)
        if rows is None:  # space
            x += 4
            continue
        for gy, row in enumerate(rows):
            for gx, bit in enumerate(row):
                if bit == "1":
                    img.putpixel((x + gx, y + gy), color)
        x += len(rows[0]) + 1


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_eq_face(img: Image.Image) -> Image.Image:
    """Replaces the stock face (11 bands, labels, dB marks, curve grid) with
    one drawn for three sliders."""
    x0, y0, x1, y1 = FACE
    for y in range(y0, y1 + 1):
        row = mix(FACE_TOP, FACE_BOTTOM, (y - y0) / (y1 - y0))
        for x in range(x0, x1 + 1):
            dot = (x - x0) % 6 == 3 and (y - y0) % 6 == 3
            img.putpixel((x, y), GRID_DOT if dot else row)

    for name, left in EQ_SLIDER_LEFT.items():
        # Recessed well around the slider groove.
        wl, wt = left - 5, SLIDER_TOP - 3
        wr, wb = left + SLIDER_W + 4, SLIDER_TOP + SLIDER_H + 2
        for y in range(wt, wb + 1):
            for x in range(wl, wr + 1):
                img.putpixel((x, y), WELL)
        for x in range(wl, wr + 1):
            img.putpixel((x, wt), WELL_DARK)
            img.putpixel((x, wb), WELL_LIGHT)
        for y in range(wt, wb + 1):
            img.putpixel((wl, y), WELL_DARK)
            img.putpixel((wr, y), WELL_LIGHT)

        # Tick marks either side: nine of them, longer at the ends and middle.
        for k in range(9):
            y = SLIDER_TOP + 4 + round(k * (SLIDER_H - 9) / 8)
            length = 4 if k in (0, 4, 8) else 2
            for d in range(length):
                img.putpixel((wl - 2 - d, y), TICK)
                img.putpixel((wr + 2 + d, y), TICK)

        # Label centred under the well.
        center = left + SLIDER_W // 2
        draw_text(img, name, center - text_width(name) // 2, wb + 2,
                  DIAL_LABEL if name == "TUNE" else LABEL)

    # Header between the ON/AUTO and PRESETS buttons, where the curve was.
    header = "SIGNAL TUNER RX"
    draw_text(img, header, 137 - text_width(header) // 2, 21, LABEL)
    return img


def recolor(img: Image.Image, numbers: bool = False) -> Image.Image:
    img = img.convert("RGB")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            rgb = px[x, y]
            if rgb == MAGIC_PINK:
                continue
            h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
            if numbers and s > 0.3:
                # Green LCD digits become amber, like a camera date stamp.
                h, s = AMBER_HUE, min(1.0, s + 0.1)
            elif s < 0.45:
                # The base skin's slate greys become purple chassis plastic.
                h, s = PURPLE_HUE, min(0.75, 0.25 + s * 0.8)
                v = min(1.0, v * 1.05)
            px[x, y] = tuple(round(c * 255) for c in colorsys.hsv_to_rgb(h, s, v))
    return img


VISCOLOR = [
    (5, 1, 11),  # background
    (40, 20, 60),  # dots
    # Spectrum, top (peak) to bottom: magenta through cyan into static grey.
    (255, 60, 200), (240, 60, 210), (220, 70, 220), (190, 80, 235),
    (150, 100, 245), (110, 130, 250), (70, 170, 250), (40, 200, 240),
    (34, 211, 238), (40, 190, 210), (60, 160, 180), (80, 130, 150),
    (100, 110, 130), (110, 100, 120), (120, 100, 120), (130, 110, 130),
    # Oscilloscope, five shades.
    (57, 255, 20), (50, 220, 30), (45, 190, 40), (40, 160, 50), (35, 130, 60),
    (255, 255, 255),  # analyser peak dots
]

PLEDIT = """[Text]
Normal=#39FF14
Current=#FFFFFF
NormalBG=#05010B
SelectedBG=#5B21B6
Font=Arial
"""


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as wsz:
        for path in sorted(BASE.iterdir()):
            name = path.name.upper()
            if name.endswith(".BMP"):
                if name == "TEXT.BMP":
                    wsz.write(path, path.name)
                    continue
                if name == "BALANCE.BMP":
                    # Mostly unused cyan filler in base 2.91; without it
                    # Webamp draws the balance slider from VOLUME.BMP.
                    continue
                img = recolor(Image.open(path), numbers=name == "NUMBERS.BMP")
                if name == "EQMAIN.BMP":
                    img = draw_eq_face(img)
                buf = io.BytesIO()
                img.save(buf, format="BMP")
                wsz.writestr(path.name, buf.getvalue())
            elif name == "VISCOLOR.TXT":
                wsz.writestr(
                    path.name,
                    "\n".join(f"{r},{g},{b}," for r, g, b in VISCOLOR) + "\n",
                )
            elif name == "PLEDIT.TXT":
                wsz.writestr(path.name, PLEDIT)
            elif name.endswith((".CUR", ".TXT")) and "UPDATES" not in name:
                wsz.write(path, path.name)
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
