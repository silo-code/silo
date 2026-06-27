---
name: docs-screenshot
description: Capture a 600×400 documentation screenshot from the running Silo app and composite it on the standard wallpaper. Use whenever adding or updating screenshots in apps/docs/public/img/guide/.
tools: Bash, Read
---

# Silo Docs Screenshot

Produces a **600×400 PNG** of a Silo UI region composited over the standard orange/purple
wallpaper (`apps/docs/public/img/wallpaper.jpg`), styled as a windowed screenshot floating
on the desktop — consistent with every other image in the guide.

## Quick reference

```
Corner      Desktop visible    Window bleeds    Window canvas pos      Merged geometry      Round corner
──────────  ─────────────────  ───────────────  ─────────────────────  ───────────────────  ────────────
top-left    top(65) left(80)   right, bottom    (80, 65)               +40+30               all 4
bot-left    bot(10) left(80)   top, right       (80, 0)                +40+-35              bot-left only
top-right   top(65) right(80)  left, bottom     (520-OW, 65)           +(480-OW)+30         top-right only
bot-right   bot(10) right(80)  top, left        (520-OW, 390-OH)       +(480-OW)+(355-OH)   bot-right only
center      all sides ~50px    none             ((600-OW)/2, (400-OH)/2)  +((600-OW)/2-40)+((400-OH)/2-35)  all 4
```

`top-left` — top half of app, feature on the LEFT (e.g. workspaces panel, editor).  
`bot-left` — bottom of app, feature on the LEFT (e.g. status bar menu).  
`top-right` — top half of app, feature on the RIGHT (e.g. file explorer, right side panel).  
`bot-right` — bottom of app, feature on the RIGHT (e.g. right-side status items, output panel).

## Pipeline

### 1. Take the screenshot

```bash
silo(){ curl -s -m30 -X POST http://127.0.0.1:7878/ \
  -H 'X-Silo-Automation: 1' -H 'Content-Type: application/json' \
  --data "$1"; }

# Set up any app state first (open panels, menus, etc.), then:
silo '{"op":"screenshot"}' > /tmp/shot.json
python3 -c "
import json,base64
d=json.load(open('/tmp/shot.json'))
r=d['result']
open('/tmp/silo.png','wb').write(base64.b64decode(r['png_base64']))
print(r['width'], r['height'])
"
# Typical output: 3024 1898  (2× retina — logical pixels are half)
```

### 2. Choose your crop

The source is **3024×1898 at 2× retina** (logical: 1512×949).

Pick the region of interest in 2× pixels and a window output size that fits the composition:

| Style    | Typical output window | Typical source crop | Scale  |
| -------- | --------------------- | ------------------- | ------ |
| top-left | 580×439               | 900×680 from (0,0)  | 0.644× |
| bot-left | 520×390               | 1131×848 from (0,Y) | 0.460× |

**Crop rules:**

- Source crop `W×H` and output window `w×h` must satisfy `W/H = w/h` (same aspect ratio).
- For **top-left**: start at (0,0); choose crop height to include the feature; bleed at right + bottom is automatic since `w > 600-80` and `h > 400-65`.
- For **bot-left**: start high enough (Y) that the full feature is inside the crop; the crop bottom is always `1898` (window bottom). Status bar = `y≈1050` is a safe start for a menu+statusbar shot.
- To zoom in more: use a smaller source crop (same output window size → larger apparent zoom).
- To zoom out / show more context: use a larger source crop.

### 3. Compose

```bash
WALL="apps/docs/public/img/wallpaper.jpg"
DOCS="apps/docs/public/img/guide"
APP=/tmp/silo.png   # or your saved screenshot

# ── Variables ──────────────────────────────────────────────────────────────
CORNER=top-left         # top-left | bot-left
CW=900; CH=680          # source crop width × height (2× pixels)
CX=0;   CY=0            # source crop origin (2× pixels)
OW=580; OH=439          # output window width × height (pixels)
OUT="$DOCS/feature.png" # destination

# ── Wallpaper background ───────────────────────────────────────────────────
magick "$WALL" -resize "600x400^" -gravity center -extent 600x400 /tmp/bg.png

# ── Crop + scale ───────────────────────────────────────────────────────────
magick "$APP" -crop ${CW}x${CH}+${CX}+${CY} +repage -resize ${OW}x${OH} /tmp/win-scaled.png

# ── Rounded corners ────────────────────────────────────────────────────────
R=10
case "$CORNER" in
  top-left)
    # All 4 corners — top-left is the real window corner; others bleed but rounding is consistent
    magick /tmp/win-scaled.png \
      \( +clone -alpha extract -fill black -colorize 100 \
         -fill white -draw "roundrectangle 0,0 $((OW-1)),$((OH-1)) 10,10" \) \
      -alpha off -compose CopyOpacity -composite /tmp/win-rounded.png
    ;;
  bot-left)
    # Round bottom-left corner only; top bleeds off canvas, right bleeds off canvas
    magick /tmp/win-scaled.png \
      \( +clone -alpha extract -fill black -colorize 100 \
         -fill white  -draw "rectangle 0,0 $((OW-1)),$((OH-1))" \
         -fill black  -draw "rectangle 0,$((OH-R)) $((R-1)),$((OH-1))" \
         -fill white  -draw "circle ${R},$((OH-R)) 0,$((OH-R))" \
      \) -alpha off -compose CopyOpacity -composite /tmp/win-rounded.png
    ;;
  top-right)
    # Round top-right corner only; left bleeds off canvas, bottom bleeds off canvas
    magick /tmp/win-scaled.png \
      \( +clone -alpha extract -fill black -colorize 100 \
         -fill white  -draw "rectangle 0,0 $((OW-1)),$((OH-1))" \
         -fill black  -draw "rectangle $((OW-R)),0 $((OW-1)),$((R-1))" \
         -fill white  -draw "circle $((OW-R)),${R} $((OW-1)),${R}" \
      \) -alpha off -compose CopyOpacity -composite /tmp/win-rounded.png
    ;;
  bot-right)
    # Round bottom-right corner only; top bleeds off canvas, left bleeds off canvas
    magick /tmp/win-scaled.png \
      \( +clone -alpha extract -fill black -colorize 100 \
         -fill white  -draw "rectangle 0,0 $((OW-1)),$((OH-1))" \
         -fill black  -draw "rectangle $((OW-R)),$((OH-R)) $((OW-1)),$((OH-1))" \
         -fill white  -draw "circle $((OW-R)),$((OH-R)) $((OW-1)),$((OH-R))" \
      \) -alpha off -compose CopyOpacity -composite /tmp/win-rounded.png
    ;;
esac

# ── Drop shadow ────────────────────────────────────────────────────────────
# shadow 90x20+0+10 → window lands at (40,35) inside the merged image
magick /tmp/win-rounded.png \
  \( +clone -background '#00000099' -shadow 90x20+0+10 \) \
  +swap -background none -layers merge +repage /tmp/win-shadowed.png

# ── Composite onto background ──────────────────────────────────────────────
# Shadow offset: window in merged image sits at (40,35). Formula: geometry = +(canvas_x−40)+(canvas_y−35)
# top-left:  window canvas (80, 65)           → +40+30
# bot-left:  window canvas (80, 0)            → +40+-35
# top-right: window canvas (520−OW, 65)       → +(480−OW)+30
# bot-right: window canvas (520−OW, 390−OH)   → +(480−OW)+(355−OH)
case "$CORNER" in
  top-left)  GX=40;         GY=30 ;;
  bot-left)  GX=40;         GY=$((-35)) ;;
  top-right) GX=$((480-OW)); GY=30 ;;
  bot-right) GX=$((480-OW)); GY=$((355-OH)) ;;
esac
magick /tmp/bg.png /tmp/win-shadowed.png -geometry +${GX}+${GY} -composite "$OUT"

magick identify -format "%wx%h\n" "$OUT"   # must print 600x400
```

## Shadow offset math (reference)

`-shadow 90x20+0+10` with `layers merge` places the source window at **(40, 35)** inside
the merged RGBA image regardless of the window dimensions.  
Formula: **`-geometry +(canvas_x − 40)+(canvas_y − 35)`**

Verify any time the shadow params change:

```bash
magick -size 100x100 xc:red \
  \( +clone -background '#00000099' -shadow 90x20+0+10 \) \
  +swap -background none -layers merge +repage /tmp/t.png
magick identify /tmp/t.png   # merged WxH
# window_x_offset = (merged_W - 100) / 2
# window_y_offset determined empirically or via: (merged_H - 100 - 10) / 2
```

## Common shots

| Guide section       | Corner    | Source crop (2×)        | Output window | Output file              |
| ------------------- | --------- | ----------------------- | ------------- | ------------------------ |
| Workspaces panel    | top-left  | 900×680 from (0,0)      | 580×439       | workspaces-panel.png     |
| Status bar + menu   | bot-left  | 1131×848 from (0,1050)  | 520×390       | workspaces-statusbar.png |
| File explorer panel | top-right | 1324×1000 from (1700,0) | 580×438       | panels-file-explorer.png |
| Getting started     | center    | full window (no crop)   | 480×304       | getting-started-app.png  |

## Rules

1. Output is always **600×400** — verify with `magick identify`.
2. **Never cut the app artificially** — the window must be a real contiguous region of the app, just cropped at the canvas edge due to bleed.
3. **Zoom into the feature** — pick a crop tight enough that the relevant UI is clearly readable.
4. Close any menus or dialogs after capturing so the app is left in a clean state.
