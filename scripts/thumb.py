#!/usr/bin/env python3
# thumb.py <frame.png> <out.png> <title> <eyebrow> - overlay an arcade title bar on a frame.
import sys, textwrap
from PIL import Image, ImageDraw, ImageFont

frame, out, title, eyebrow = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

img = Image.open(frame).convert("RGB").resize((1280, 720))
overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
d = ImageDraw.Draw(overlay)
# dark bar across the bottom for legibility
d.rectangle([0, 470, 1280, 720], fill=(6, 6, 18, 205))
# thin gold rule above the bar
d.rectangle([0, 466, 1280, 470], fill=(245, 200, 66, 255))
img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
d = ImageDraw.Draw(img)

def font(sz):
    for p in ["/System/Library/Fonts/Supplemental/Arial Bold.ttf",
              "/System/Library/Fonts/Helvetica.ttc",
              "/Library/Fonts/Arial Bold.ttf"]:
        try:
            return ImageFont.truetype(p, sz)
        except Exception:
            pass
    return ImageFont.load_default()

d.text((52, 500), eyebrow.upper(), font=font(30), fill=(0, 229, 255))
y = 540
for ln in textwrap.wrap(title, width=32)[:2]:
    d.text((52, y), ln, font=font(58), fill=(245, 200, 66))
    y += 66
img.save(out)
print("wrote", out)
