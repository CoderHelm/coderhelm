"""Turns the light 2x PNGs from dashboard/e2e/landing-shots-*.spec.ts into the
home page's pictures in public/shots/home (src/content/shots.ts).

usage: python3 -I dashboard/scripts/home-shots.py RAW_DIR public/shots/home [name ...]
Needs Pillow with WebP and AVIF. Prints each picture's size for shots.ts.
"""
import sys
from pathlib import Path
from PIL import Image

raw, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

SIDEBAR = 504  # px at 2x: the dashboard's left menu

# site name: (raw file, crop) where crop is None for the full window, or
# "main" for the content area beside the menu, at 16:10.
JOBS = {
    "hero": ("run.png", None),
    "hero-main": ("run.png", "main"),  # the hero on phones, without the menu
    "run": ("run-activity.png", "main"),
    "review": ("review-findings.png", "main"),
    "alert": ("alert.png", "main"),
    "release": ("release.png", "main"),
    "chat": ("chat.png", ("main", 270)),
    "app-map": ("app-map.png", None),
}

only = set(sys.argv[3:])
for name, (src, crop) in JOBS.items():
    if only and name not in only:
        continue
    p = raw / src
    if not p.exists():
        print(f"{name}: missing {src}")
        continue
    im = Image.open(p).convert("RGB")
    if crop:
        top = crop[1] if isinstance(crop, tuple) else 0
        w = im.width - SIDEBAR
        h = min(im.height - top, round(w * 10 / 16))
        im = im.crop((SIDEBAR, top, im.width, top + h))
    # Phones only ever take the 1280 wide crop of the hero.
    for width in (1280,) if name == "hero-main" else (1280, 2400):
        r = im if im.width <= width else im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        r.save(out / f"{name}-{width}.webp", "WEBP", quality=82, method=6)
        r.save(out / f"{name}-{width}.avif", "AVIF", quality=60, speed=4)
    fb = im.resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS)
    fb.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out / f"{name}.png", optimize=True)
    print(f"{name}: width {fb.width} height {fb.height}")
