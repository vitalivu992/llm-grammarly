# Generate the toolbar/store icons: espresso tile, gold rule, gold pen nib.
import os, sys
from PIL import Image, ImageDraw

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
S = 512
ESP, GOLD, CREAM = (36, 23, 14, 255), (201, 160, 99, 255), (243, 230, 207, 255)
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rectangle([0, 0, S - 1, S - 1], fill=ESP)
d.rectangle([28, 28, S - 29, S - 29], outline=GOLD, width=14)
# Nib: a pointed shield shape with a slit and breather hole.
cx = S / 2
nib = [(cx, 420), (cx - 110, 250), (cx - 70, 120), (cx + 70, 120), (cx + 110, 250)]
d.polygon(nib, fill=GOLD)
d.rectangle([cx - 80, 92, cx + 80, 124], fill=CREAM)
d.line([(cx, 405), (cx, 250)], fill=ESP, width=14)
d.ellipse([cx - 22, 222, cx + 22, 266], fill=ESP)
for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(out, f'{size}.png'))
