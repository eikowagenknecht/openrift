# Extracting card frame templates from existing card images

The card designer ([ADR-023](adr/023-card-designer.md)) draws the entire card frame in CSS: energy gem, might shield, power runes, the domain-tinted name banner with its rune icons, the type label, the rules box, the footer ornaments, gradients and noise. That is a single ~360-line component (`apps/web/src/features/cards/components/card-placeholder-image.tsx`) that only ever approximates the real Riftbound chrome.

An alternative is to treat the frame as a **template image** per card combination (type x rarity x domain x has-power-cost, ...) and draw only the few dynamic elements on top (art behind, energy/might/power numbers, name, type, rules/flavor text). We don't have these template images, only the ~2100 finished card images that were produced from them.

This doc describes how to **recover the templates from the finished cards** so it can be repeated for every combination. The frontend integration (template as a background layer + CSS text overlay) is separate, future work.

## How it works

The core idea is **temporal-median background extraction**: stack many pixel-aligned cards that share a template and reduce per pixel. Constant chrome survives; per-card content (art, text, numbers) washes out. The refinement that makes it clean is choosing the **reduction operator per region by polarity**.

## 1. Bucket the cards (DB)

Group by everything that determines the template. One template **per domain** (the name banner carries domain-specific rune icons). Restrict to standard printings.

```sql
-- Example: single-domain Fury, common, unit, with no power cost.
SELECT pi.image_file_id
FROM cards c
JOIN printings p        ON p.card_id = c.id
JOIN printing_images pi ON pi.printing_id = p.id AND pi.face = 'front' AND pi.is_active
WHERE c.type = 'unit' AND p.rarity = 'common'
  AND p.art_variant = 'normal' AND NOT p.is_overnumbered AND p.finish = 'normal'
  AND p.language = 'EN'                     -- see alignment note
  AND c.power IS NULL                        -- "with power cost" => c.power IS NOT NULL
  AND EXISTS (SELECT 1 FROM card_domains d  WHERE d.card_id = c.id AND d.domain_slug = 'fury')
  AND (SELECT count(*) FROM card_domains d2 WHERE d2.card_id = c.id) = 1;
```

## 2. Align the stack

- The canonical render is **744x1039** (`media/cards/<last-2-of-image_file_id>/<id>-full.webp`). Keep only files at exactly that size; some printings are `744x1040` (crop one row) and a few are off-resolution (skip).
- **Filter `language='EN'`.** Mixed-language buckets inject CJK ghosts into the text and footer that survive stacking. As a bonus, EN renders tend to be exactly 744x1039.
- Median tolerates up to ~50% contamination, so exclude full-art / alt-art / overnumbered / foil printings (their art bleeds over the frame and breaks "chrome is constant"). Overnumbered is its own column since ADR-044, so `art_variant = 'normal'` no longer rules it out.

## 3. Reduce per region, by polarity

ImageMagick `convert ... -evaluate-sequence <op>` reduces a stack per pixel. Pick the op by what the region looks like:

| Region                                               | Looks like                          | Operator        | Why                                                           |
| ---------------------------------------------------- | ----------------------------------- | --------------- | ------------------------------------------------------------- |
| Frame, gem ring, name-banner runes, footer ornaments | constant chrome                     | `median`        | identical in every card; median is robust to a few strays     |
| Energy disc, parchment rules box                     | **dark** marks on a **light** field | `max` (lighten) | picks the light background wherever any card had no ink there |
| Name banner, footer bar                              | **light** text on a **dark** field  | `min` (darken)  | picks the dark background wherever any card had no text there |
| Art window                                           | full-colour, varies every card      | cut transparent | highest variability; not recoverable, becomes the art slot    |

`-evaluate-sequence` has no standard-deviation op, but it has `mean` and `rootmeansquare`, so the variability map (used to find the art window) is `sqrt(rms^2 - mean^2)`:

```bash
convert stack/*.webp -evaluate-sequence mean           mean.png
convert stack/*.webp -evaluate-sequence rootmeansquare rms.png
convert rms.png mean.png -fx "sqrt(max(0,u*u-v*v))" -separate -evaluate-sequence max sd.png
# art window = the largest high-variability blob:
convert sd.png -threshold 12% -morphology Open Disk:5 -morphology Close Disk:8 artwindow.png
```

## 4. Compose the template

Median is the base; graft the polarity-specific regions over it.

```bash
# base: constant chrome
convert stack/*.webp -evaluate-sequence median base.png
# whole-stack reductions to graft from
convert stack/*.webp -evaluate-sequence max  smax.png
convert stack/*.webp -evaluate-sequence min  smin.png

# parchment rules box (dark text on light): take the lightened version. NO blur.
convert smax.png -crop 744x265+0+693 +repage parchment.png

# footer bar (light text on dark): take the darkened version
convert smin.png -crop 744x81+0+958  +repage footer.png

# name banner (light text on dark): darkened band, keeps the red gradient + runes
convert smin.png -crop 744x64+0+596  +repage banner.png

# energy disc (dark number on white disc): lightened, with a light median to dissolve
# the faint central residual (the disc is uniform white, so this does not wash anything).
# Mask to the disc interior so the surrounding art does not bleed in.
convert smax.png -statistic median 5x5 disc.png
convert -size 744x1039 xc:black -fill white -draw "circle 85,86 122,86" -blur 0x1.5 discmask.png
convert disc.png discmask.png -alpha off -compose CopyOpacity -composite disc_overlay.png

# graft everything onto the base
convert base.png \
  parchment.png    -geometry +0+693 -compose over -composite \
  footer.png       -geometry +0+958 -compose over -composite \
  banner.png       -geometry +0+596 -compose over -composite \
  disc_overlay.png                  -compose over -composite \
  template.png
```

Region coordinates above are for the unit layout at 744x1039; they are constant across buckets at the same layout, so they are written once. The same coordinates feed the dynamic-text overlay in the designer, and most of that math already exists in `apps/web/src/features/designer/lib/card-designer.ts`.

## Limitations (the hand-edit that remains)

- **Constant-position elements cannot be stack-removed.** Anything that lands in the same place on (almost) every card looks like chrome to the stack: the keyword pill at the top-left of the rules box (ACCELERATE, EQUIP, ...), the `(c)...RGI` copyright string in the footer. These need a small manual fill on the (flat) background.
- **Do not blur the parchment.** A `-statistic median NxN` pass over the parchment mutes its gradient and reads as washed-out. Max-lighten alone is bright and correct. (The energy disc is the exception: it is a uniform white circle, so a light median there is invisible.)
- **Long-tail buckets** (legends, overnumbered, rare supertypes) may have fewer than ~8 clean samples; below that the median gets noisy and the CSS renderer is the better fallback.

## Validation

The method was validated on the **single-domain Fury / common / unit / no-power-cost** bucket (40 cards, 20 EN at 744x1039). The recovered template reproduces the gem ring, might shield, name banner with both fury runes, type label, rules box, and footer; the energy number and the white name text are removed by the polarity reductions; only the documented constant-position residuals remained for hand-editing.

## Related

- [ADR-023](adr/023-card-designer.md) — the card designer. Frontend layering of these templates would extend it.
- [ADR-007](adr/007-self-hosted-card-images.md) — card image storage and the 744x1039 canonical render.
