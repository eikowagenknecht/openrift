/* oxlint-disable import/no-nodejs-modules -- standalone script */
// Rebuilds `apps/web/public/logo.svg` as a symmetric, zoned SVG.
//
// Symmetry is baked into the output: for each zone we build the left half,
// mirror it across the vertical centerline, and unite both halves into a
// single path. Editing the SVG in any GUI editor just works — there's no
// `<use>` / transform trickery to preserve.
//
// Zones (each becomes a <path class="zone-*">, colorable via CSS):
//   - zone-frame        — outer rift + echo band + inner silhouette + the
//                         two ray slivers at the bottom. All traced
//                         subpaths must stay in one compound path so
//                         their nonzero-winding interaction carves the
//                         echo and slivers correctly.
//   - zone-card-side    — the two fanned side cards (rotated rounded rects)
//   - zone-card-center  — the center rounded rectangle
//   - zone-rays         — supplementary overlay covering the bottom ray
//                         shapes. Empty fill by default so the carved
//                         slivers show through; set a fill to paint the
//                         rays in a different color for colored exports.
//
// Modes:
//   bun run scripts/rebuild-logo.ts          — full rebuild from PARAMS
//   bun run scripts/rebuild-logo.ts --sync   — re-symmetrize each zone's
//                                              `d` in the current SVG
//                                              (use after editing one
//                                              side in a GUI editor)

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import paper from "paper-jsdom";

const VIEW_BOX = { width: 699, height: 680 } as const;

const PARAMS = {
  // Center card
  cardWidth: 120.6,
  cardHeight: 176.8,
  cardY: 217.1,
  cardRadius: 14,

  // Side card (left — right is computed by mirroring). A proper rounded
  // rectangle rotated outward around its own center; the outset of the
  // center card is subtracted so adjacent cards read as separate
  // (otherwise all three whites visually merge into one blob).
  sideCardWidth: 120.6,
  sideCardHeight: 176.8,
  sideCardRadius: 14,
  sideCardCenter: { x: 275, y: 316 },
  sideCardRotation: -12, // degrees; negative = CCW (top tilts right, bottom tilts left)
  sideCardGap: 12, // black gap carved around the center card
} as const;

// Original traced logo path. We only reuse the frame subpaths [0..4] and
// the left decorative ray [8] from this source. Everything else is built
// from primitives.
const TRACED_PATH =
  "M118.5 11.2C99 25.8 14.1 88.2 14.1 88.2L1.8 310.5l339.6 359.4 8 8.3 5.6-5.9c4.9-5 332.8-352.3 332.8-352.3l9.2-9.8v-6.4c0-3.4-1.1-25.9-2.5-49.8-5.6-98.6-6.4-114.5-7.5-136.5-.6-12.7-1.3-24.4-1.6-26.2-.4-2.7-2.8-4.8-18.7-16.5C666.7 74.8 566.1 1 564 1c-1.7 0-101.4 11.4-135.5 15-.7 0-34 40.2-37.7 44.7-4.4 5.2-9.2 12.6-13.2 20.5-12.8 24.6-26.3 48.3-27.7 48.6-1.5.3-4.9-5.6-26.1-44.8a146 146 0 0 0-20.4-30c-6.6-8-28.6-35.2-32.5-39-1.6 0-92-10-112.9-12.5a404 404 0 0 0-23.5-2.4c-2.2.1-6.5 2.8-16 10.1m22.5 6.3 112.9 12.7c10 1.1 10.5 1.3 13.6 4.7l21.4 24.3L307 79.9l10.9 28.8c6 15.8 12 31.4 13.4 34.6 3.1 6.8 2.1 6.7-1.8-.1-1.5-2.6-9.2-14.9-17.1-27.3-13.3-20.9-15-23.1-22.1-29l-27.8-23.6-123.3-9.5S60 113.2 60 116c0 1.7-10.1 164-10.1 164s236 271.9 238.8 274.9c5.8 5.9 60 99.8 60 99.8L17.9 305.5S29 96.6 29.8 96.1c0 0 66.5-49.4 95.7-70.4 10.9-8 12.3-8.7 15.5-8.2m430.3 6.3 96.4 71c2.2 1.7 2.3 2.6 7.3 91.2 2.7 49.2 5.2 96.2 5.5 104.5l.6 15S349.5 656.3 350.4 654.7c0 0 57.9-97.2 59.6-99.6 1-1.4.6-.6 4.1-4.9 5.4-6.5 235.1-269.7 235.1-269.7l-10.5-167.7L560 54.1l-123.5 9.2-24.8 21.1a65 65 0 0 0-17.4 18.9q-13.4 20-25.4 40.8c-1.6 3.4-3.2 5.9-3.5 5.6-.2-.2 2-6.4 4.9-13.8l8.6-21.9c10.1-26.1 13.5-33.9 15.9-36.5l38.6-45.2c17-3 111.6-13.8 111.6-13.8 17.2-2.1 16-2.3 26.3 5.3M254.5 83.3s43.3 30.3 44.9 32l36.3 40.3 7.4 26c.3 1.2-8.3-7.6-18.7-17.8-29.9-29.2-30.6-29.8-44.5-36.8l-28.4-14.8-89.4 1.1-44.1 37.2-1.7 52s17.3 35.9 22.3 46.9c3 6.1-22.2-23.1-22.4-21.8l-1 18.9-.8 17s17.7 27 22 32.2c3.5 2 48.1 44.5 48.1 44.5S152 323.8 152 324.8c0 .8 138.9 230.2 138.6 230.2S74.2 273.5 74.2 273.5l9.2-145.6s64.8-50 66.6-49.4m465.7 49.7s9 144.6 8.2 146c-1 1.9-146 188.7-200.9 261.3-15.8 21.6-18.4 24.5-9.1 10 3.8-6 39.2-64.6 44.1-73 2.8-4.9 89.3-147.5 88.7-148.2-.3-.2-33.2 15.8-33.2 15.8s34.8-32.6 43.5-40.3a97 97 0 0 0 18.2-21.9l9.7-14.4-2.2-37.2c-.2-.1-23.3 25.8-23.3 25.8-1.7 1.4 23.5-48.7 23.5-48.7l-1.8-53.1-44.3-37-89.3-1.1-43.4 22.3-48.8 47.4 8-26.4s15.9-17.1 20.2-22a156 156 0 0 1 40.3-35.7L445.1 83s103.6-4.3 104.9-4.8m-143 141c8.5 4.4 8-1.1 8 86.8 0 75.6-.1 77.6-2 80.8a18 18 0 0 1-5.2 5.2c-3.2 2-4.8 2-54.5 1.8l-51.3-.3c-4.6-.4-8.1-6.6-7.5-7.5 0 0-.2-158.3.6-160.2 1.5-3.7 5.2-6.9 9.1-7.8 1.8-.4 24.7-.8 50.8-.9 47.5-.1 47.6-.1 52 2.1m-124.9 7 1.4 165.6 1.2 5.7c3.1 4.4 5.3 3.4 3.4 4.4a185 185 0 0 1-29.5 10.1c-3.7 0-8.9-3-11-6.2a17778 17778 0 0 1-51.7-134.2 16 16 0 0 1 3.6-13.6c1.8-1.8 71.6-30.2 76.5-32.4s6-2 6.1.6m161.7 13.4c8.6 3.7 52.4 22.1 53.4 23.1q8.4 7.5 1.4 23.8l-45.1 113.9c-3.4 9-5.7 12.2-10.1 13.6-5 1.7-10.5.9-19.9-3l-12.9-5.1 3-1.8c4.2-2.6 8.3-7 10.5-11.3 1.8-3.6 1.9-7.1 1.9-81.8 0-53.7.3-78 1-78s8.2 3 16.8 6.6M261 455l34.7 32.4c1.4 1.3 35.1 101.2 37.1 106.3 5.3 13.9 4.5 13.1-4.5-4.7l-61.8-117.5c-9.8-19-10.9-22.3-5.5-16.5m102.4 147.7c-.3-.3 29.7-89.3 35.5-107.8 1.4-4.2 3-6.6 6.6-10 0 0 36.2-33.5 36.4-33.3";

// Make a compound path perfectly symmetric by treating each subpath
// individually. Subpaths are classified by their bbox relative to the
// centerline:
//  - entirely on the right → dropped (a mirror of the corresponding
//    left subpath will replace them)
//  - entirely on the left → kept as-is and a mirror copy is added
//  - bridging the centerline → kept as-is (assumed already symmetric;
//    clipping + boolean-uniting a CW hole subpath flips its winding
//    and turns the hole into a fill)
// Winding is preserved across the mirror: scale(-1,1) reverses each
// segment's direction, so we reverse() the mirrored copy to restore it.
function symmetrize(shape: paper.PathItem): string {
  const cx = VIEW_BOX.width / 2;
  const subpaths =
    shape instanceof paper.CompoundPath ? [...shape.children] : [shape as paper.Path];
  const out = new paper.CompoundPath({ fillRule: "nonzero" });
  for (const sub of subpaths) {
    const b = sub.bounds;
    if (b.x >= cx - 0.5) {
      continue;
    }
    if (b.x + b.width > cx + 0.5) {
      out.addChild(sub.clone());
      continue;
    }
    out.addChild(sub.clone());
    const mirror = sub.clone();
    mirror.scale(-1, 1, new paper.Point(cx, 0));
    mirror.reverse();
    out.addChild(mirror);
  }
  return out.pathData;
}

function build(): string {
  paper.setup(new paper.Size(VIEW_BOX.width, VIEW_BOX.height));

  // --- Frame: subpaths [0..4] (outer rift, echo band, inner silhouette)
  // plus the ray subpaths [8..9] whose winding carves the two thin white
  // slivers visible at the bottom. All must stay in the same compound
  // path — splitting them out flattens the voids away via paper.js's
  // boolean unite. ---
  const tracedA = new paper.CompoundPath({ pathData: TRACED_PATH, fillRule: "nonzero" });
  const frame = new paper.CompoundPath({ fillRule: "nonzero" });
  for (const i of [0, 1, 2, 3, 4, 8, 9]) {
    frame.addChild(tracedA.children[i].clone());
  }

  // --- Rays: supplementary overlay of the left ray subpath [8]; right
  // is computed by mirroring. Empty fill by default so the frame's
  // carved slivers show through. ---
  const tracedB = new paper.CompoundPath({ pathData: TRACED_PATH, fillRule: "nonzero" });
  const rayLeft = new paper.CompoundPath({ fillRule: "nonzero" });
  rayLeft.addChild(tracedB.children[8].clone());

  // --- Center card: clean rounded rect, centered horizontally ---
  const cardX = (VIEW_BOX.width - PARAMS.cardWidth) / 2;
  const cardCenter = new paper.Path.Rectangle({
    point: [cardX, PARAMS.cardY],
    size: [PARAMS.cardWidth, PARAMS.cardHeight],
    radius: PARAMS.cardRadius,
  });

  // --- Side card (left): rotated rounded rectangle ---
  const sideLeft = new paper.Path.Rectangle({
    point: [
      PARAMS.sideCardCenter.x - PARAMS.sideCardWidth / 2,
      PARAMS.sideCardCenter.y - PARAMS.sideCardHeight / 2,
    ],
    size: [PARAMS.sideCardWidth, PARAMS.sideCardHeight],
    radius: PARAMS.sideCardRadius,
  });
  sideLeft.rotate(
    PARAMS.sideCardRotation,
    new paper.Point(PARAMS.sideCardCenter.x, PARAMS.sideCardCenter.y),
  );

  // Carve an outset of the center card out of the side card so the two
  // cards read as separate shapes (visible black gap) even when both are
  // filled the same color.
  const cardOutset = new paper.Path.Rectangle({
    point: [cardX - PARAMS.sideCardGap, PARAMS.cardY - PARAMS.sideCardGap],
    size: [PARAMS.cardWidth + 2 * PARAMS.sideCardGap, PARAMS.cardHeight + 2 * PARAMS.sideCardGap],
    radius: PARAMS.cardRadius + PARAMS.sideCardGap,
  });
  const sideLeftCarved = sideLeft.subtract(cardOutset) as paper.PathItem;

  // The card shapes punch real holes in the frame so anything behind the
  // SVG (page background, icon tile, etc.) shows through. The same
  // shapes are also emitted as separate paths with fill="none" below, so
  // consumers can optionally paint them a different color.
  const cardCutout = cardCenter.clone().unite(sideLeftCarved) as paper.PathItem;
  const cardCutoutMirrored = cardCutout
    .clone()
    .scale(-1, 1, new paper.Point(VIEW_BOX.width / 2, 0)) as paper.PathItem;
  const cardsMask = cardCutout.unite(cardCutoutMirrored) as paper.PathItem;
  const frameWithCardHoles = frame.subtract(cardsMask) as paper.PathItem;

  const zones = {
    frame: symmetrize(frameWithCardHoles),
    cardSide: symmetrize(sideLeftCarved),
    cardCenter: symmetrize(cardCenter),
    rays: symmetrize(rayLeft),
  };

  // Default fills: frame + rays use currentColor; cards are transparent
  // holes in the frame (fill="none"). Override any zone via its class on
  // the consumer side for colored exports.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_BOX.width} ${VIEW_BOX.height}" fill-rule="nonzero">` +
    // Paint order: frame (with card holes) → side cards → center card → rays.
    `<path class="zone-frame" fill="currentColor" d="${zones.frame}"/>` +
    `<path class="zone-card-side" fill="none" d="${zones.cardSide}"/>` +
    `<path class="zone-card-center" fill="none" d="${zones.cardCenter}"/>` +
    `<path class="zone-rays" fill="none" d="${zones.rays}"/>` +
    `</svg>\n`
  );
}

// Re-symmetrize every <path>'s `d` in an existing SVG. Use this after
// manually editing one side of a zone in a GUI editor (Affinity, Figma,
// etc. often strip class attributes on save, so we match by <path>
// element rather than by class). Every path is symmetrized; subpaths
// on the right of the centerline are dropped and replaced with the
// mirror of their left counterparts.
function sync(existing: string): string {
  paper.setup(new paper.Size(VIEW_BOX.width, VIEW_BOX.height));
  const pathRe = /(<path[^>]*\bd=")([^"]*)(")/g;
  return existing.replace(pathRe, (_, pre: string, d: string, post: string) => {
    const item = new paper.CompoundPath({ pathData: d, fillRule: "nonzero" });
    return `${pre}${symmetrize(item)}${post}`;
  });
}

const mode = process.argv[2];
const out = resolve(import.meta.dir, "../apps/web/public/logo.svg");

if (mode === "--sync") {
  const existing = readFileSync(out, "utf-8");
  const synced = sync(existing);
  writeFileSync(out, synced);
  console.log(`synced ${synced.length} bytes → ${out}`);
} else {
  const svg = build();
  writeFileSync(out, svg);
  console.log(`wrote ${svg.length} bytes → ${out}`);
}

// paper-jsdom keeps event loop handles alive, so exit explicitly.
process.exit(0);
