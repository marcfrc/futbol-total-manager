#!/usr/bin/env python3
"""Genera los iconos del lanzador de Android (escudo verde + franja teal + balón)
en android/app/src/main/res/mipmap-*/. Requiere Pillow: pip install Pillow

Uso: python3 scripts/generate-android-icons.py
"""
import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res"

SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

GREEN = (46, 160, 82)
DARK = (14, 34, 22)
TEAL = (46, 196, 182)
WHITE = (245, 245, 245)


def shield(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = size * 0.08
    w, h = size - 2 * m, size - 2 * m
    # escudo: rectángulo redondeado con punta inferior
    pts = [(m, m), (m + w, m), (m + w, m + h * 0.62),
           (m + w / 2, m + h), (m, m + h * 0.62)]
    d.polygon(pts, fill=DARK)
    inner = 0.06 * size
    pts2 = [(m + inner, m + inner), (m + w - inner, m + inner),
            (m + w - inner, m + h * 0.60), (m + w / 2, m + h - inner),
            (m + inner, m + h * 0.60)]
    d.polygon(pts2, fill=GREEN)
    # franja teal diagonal
    d.polygon([(m + inner, m + h * 0.34), (m + w - inner, m + h * 0.18),
               (m + w - inner, m + h * 0.30), (m + inner, m + h * 0.46)], fill=TEAL)
    # balón
    r = size * 0.13
    cx, cy = m + w / 2, m + h * 0.56
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    d.ellipse([cx - r * 0.45, cy - r * 0.45, cx + r * 0.45, cy + r * 0.45], fill=DARK)
    return img


def main() -> None:
    for dpi, px in SIZES.items():
        outdir = RES / f"mipmap-{dpi}"
        outdir.mkdir(parents=True, exist_ok=True)
        icon = shield(px)
        icon.save(outdir / "ic_launcher.png")
        icon.save(outdir / "ic_launcher_round.png")
        # foreground (con margen para adaptive icons)
        fg = Image.new("RGBA", (int(px * 1.5), int(px * 1.5)), (0, 0, 0, 0))
        inner = shield(px)
        off = int(px * 0.25)
        fg.paste(inner, (off, off), inner)
        fg.save(outdir / "ic_launcher_foreground.png")
        print(f"mipmap-{dpi}: {px}px OK")


if __name__ == "__main__":
    main()
