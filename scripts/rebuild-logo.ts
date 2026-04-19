/* oxlint-disable import/no-nodejs-modules -- standalone script */
// Rebuilds `apps/web/public/logo.svg` as a symmetric, zoned SVG.
//
// Symmetry is baked into the output: for each zone we build the left half,
// mirror it across the vertical centerline, and unite both halves into a
// single path. Editing the SVG in any GUI editor just works — there's no
// `<use>` / transform trickery to preserve.
//
// Zones (each becomes a <path class="zone-*">, colorable via CSS):
//   - zone-frame        — outer rift / heart shape (from traced source)
//   - zone-card-side    — the two fanned side cards (rotated rounded rects)
//   - zone-card-center  — the center rounded rectangle
//   - zone-rays         — the bottom decorative rays (from traced source)
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

  // Side card (left — right is computed by mirroring). Defined as a proper
  // rounded rectangle rotated outward around its own center, painted under
  // the center card so only the fanned-out portion is visible.
  sideCardWidth: 120.6,
  sideCardHeight: 176.8,
  sideCardRadius: 14,
  sideCardCenter: { x: 243, y: 316 },
  sideCardRotation: -14, // degrees; negative = CCW (top tilts right, bottom tilts left)
} as const;

// Original traced logo path. We only reuse the frame subpaths [0..4] and
// the left decorative ray [8] from this source. Everything else is built
// from primitives.
const TRACED_PATH =
  "M118.5 11.2C99 25.8 14.1 88.2 14.1 88.2L1.8 310.5l339.6 359.4 8 8.3 5.6-5.9c4.9-5 332.8-352.3 332.8-352.3l9.2-9.8v-6.4c0-3.4-1.1-25.9-2.5-49.8-5.6-98.6-6.4-114.5-7.5-136.5-.6-12.7-1.3-24.4-1.6-26.2-.4-2.7-2.8-4.8-18.7-16.5C666.7 74.8 566.1 1 564 1c-1.7 0-101.4 11.4-135.5 15-.7 0-34 40.2-37.7 44.7-4.4 5.2-9.2 12.6-13.2 20.5-12.8 24.6-26.3 48.3-27.7 48.6-1.5.3-4.9-5.6-26.1-44.8a146 146 0 0 0-20.4-30c-6.6-8-28.6-35.2-32.5-39-1.6 0-92-10-112.9-12.5a404 404 0 0 0-23.5-2.4c-2.2.1-6.5 2.8-16 10.1m22.5 6.3 112.9 12.7c10 1.1 10.5 1.3 13.6 4.7l21.4 24.3L307 79.9l10.9 28.8c6 15.8 12 31.4 13.4 34.6 3.1 6.8 2.1 6.7-1.8-.1-1.5-2.6-9.2-14.9-17.1-27.3-13.3-20.9-15-23.1-22.1-29l-27.8-23.6-123.3-9.5S60 113.2 60 116c0 1.7-10.1 164-10.1 164s236 271.9 238.8 274.9c5.8 5.9 60 99.8 60 99.8L17.9 305.5S29 96.6 29.8 96.1c0 0 66.5-49.4 95.7-70.4 10.9-8 12.3-8.7 15.5-8.2m430.3 6.3 96.4 71c2.2 1.7 2.3 2.6 7.3 91.2 2.7 49.2 5.2 96.2 5.5 104.5l.6 15S349.5 656.3 350.4 654.7c0 0 57.9-97.2 59.6-99.6 1-1.4.6-.6 4.1-4.9 5.4-6.5 235.1-269.7 235.1-269.7l-10.5-167.7L560 54.1l-123.5 9.2-24.8 21.1a65 65 0 0 0-17.4 18.9q-13.4 20-25.4 40.8c-1.6 3.4-3.2 5.9-3.5 5.6-.2-.2 2-6.4 4.9-13.8l8.6-21.9c10.1-26.1 13.5-33.9 15.9-36.5l38.6-45.2c17-3 111.6-13.8 111.6-13.8 17.2-2.1 16-2.3 26.3 5.3M254.5 83.3s43.3 30.3 44.9 32l36.3 40.3 7.4 26c.3 1.2-8.3-7.6-18.7-17.8-29.9-29.2-30.6-29.8-44.5-36.8l-28.4-14.8-89.4 1.1-44.1 37.2-1.7 52s17.3 35.9 22.3 46.9c3 6.1-22.2-23.1-22.4-21.8l-1 18.9-.8 17s17.7 27 22 32.2c3.5 2 48.1 44.5 48.1 44.5S152 323.8 152 324.8c0 .8 138.9 230.2 138.6 230.2S74.2 273.5 74.2 273.5l9.2-145.6s64.8-50 66.6-49.4m465.7 49.7s9 144.6 8.2 146c-1 1.9-146 188.7-200.9 261.3-15.8 21.6-18.4 24.5-9.1 10 3.8-6 39.2-64.6 44.1-73 2.8-4.9 89.3-147.5 88.7-148.2-.3-.2-33.2 15.8-33.2 15.8s34.8-32.6 43.5-40.3a97 97 0 0 0 18.2-21.9l9.7-14.4-2.2-37.2c-.2-.1-23.3 25.8-23.3 25.8-1.7 1.4 23.5-48.7 23.5-48.7l-1.8-53.1-44.3-37-89.3-1.1-43.4 22.3-48.8 47.4 8-26.4s15.9-17.1 20.2-22a156 156 0 0 1 40.3-35.7L445.1 83s103.6-4.3 104.9-4.8m-143 141c8.5 4.4 8-1.1 8 86.8 0 75.6-.1 77.6-2 80.8a18 18 0 0 1-5.2 5.2c-3.2 2-4.8 2-54.5 1.8l-51.3-.3c-4.6-.4-8.1-6.6-7.5-7.5 0 0-.2-158.3.6-160.2 1.5-3.7 5.2-6.9 9.1-7.8 1.8-.4 24.7-.8 50.8-.9 47.5-.1 47.6-.1 52 2.1m-124.9 7 1.4 165.6 1.2 5.7c3.1 4.4 5.3 3.4 3.4 4.4a185 185 0 0 1-29.5 10.1c-3.7 0-8.9-3-11-6.2a17778 17778 0 0 1-51.7-134.2 16 16 0 0 1 3.6-13.6c1.8-1.8 71.6-30.2 76.5-32.4s6-2 6.1.6m161.7 13.4c8.6 3.7 52.4 22.1 53.4 23.1q8.4 7.5 1.4 23.8l-45.1 113.9c-3.4 9-5.7 12.2-10.1 13.6-5 1.7-10.5.9-19.9-3l-12.9-5.1 3-1.8c4.2-2.6 8.3-7 10.5-11.3 1.8-3.6 1.9-7.1 1.9-81.8 0-53.7.3-78 1-78s8.2 3 16.8 6.6M261 455l34.7 32.4c1.4 1.3 35.1 101.2 37.1 106.3 5.3 13.9 4.5 13.1-4.5-4.7l-61.8-117.5c-9.8-19-10.9-22.3-5.5-16.5m102.4 147.7c-.3-.3 29.7-89.3 35.5-107.8 1.4-4.2 3-6.6 6.6-10 0 0 36.2-33.5 36.4-33.3";

// Clip a shape to the left half, mirror the clipped copy across the
// vertical centerline, and return the union of both halves as path data.
// Guarantees perfect left-right symmetry regardless of the input's
// original symmetry properties.
function symmetrize(shape: paper.PathItem): string {
  const clip = new paper.Path.Rectangle({
    point: [0, 0],
    size: [VIEW_BOX.width / 2 + 0.5, VIEW_BOX.height],
  });
  const leftHalf = shape.intersect(clip) as paper.PathItem;
  const rightHalf = leftHalf.clone() as paper.PathItem;
  rightHalf.scale(-1, 1, new paper.Point(VIEW_BOX.width / 2, 0));
  const full = leftHalf.unite(rightHalf) as paper.PathItem;
  return full.pathData;
}

function build(): string {
  paper.setup(new paper.Size(VIEW_BOX.width, VIEW_BOX.height));

  // --- Frame: subpaths [0..4] of the traced source ---
  const tracedA = new paper.CompoundPath({ pathData: TRACED_PATH, fillRule: "nonzero" });
  const frame = new paper.CompoundPath({ fillRule: "nonzero" });
  for (let i = 0; i < 5; i++) {
    frame.addChild(tracedA.children[i].clone());
  }

  // --- Rays: left decorative ray [8]; right is computed by mirroring ---
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

  const zones = {
    frame: symmetrize(frame),
    cardSide: symmetrize(sideLeft),
    cardCenter: symmetrize(cardCenter),
    rays: symmetrize(rayLeft),
  };

  // Default fills reproduce the original single-color look: frame and rays
  // are drawn in currentColor (picks up text color), cards are #fff so
  // they read as voids against the frame. Override via class on any
  // consumer: `.zone-card-center { fill: gold }` etc.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_BOX.width} ${VIEW_BOX.height}" fill-rule="nonzero">` +
    // Paint order: frame → side cards (behind center) → center card → rays.
    `<path class="zone-frame" fill="currentColor" d="${zones.frame}"/>` +
    `<path class="zone-card-side" fill="#fff" d="${zones.cardSide}"/>` +
    `<path class="zone-card-center" fill="#fff" d="${zones.cardCenter}"/>` +
    `<path class="zone-rays" fill="currentColor" d="${zones.rays}"/>` +
    `</svg>\n`
  );
}

// Re-symmetrize every zone path in an existing SVG. Use this after
// manually editing one side of a zone in a GUI editor: the left half of
// each path is extracted, mirrored, and united back into a symmetric
// path. Paths without a `class="zone-*"` attribute are left untouched.
function sync(existing: string): string {
  paper.setup(new paper.Size(VIEW_BOX.width, VIEW_BOX.height));
  const zonePathRe = /(<path[^>]*class="zone-[^"]*"[^>]*\bd=")([^"]*)(")/g;
  return existing.replace(zonePathRe, (_, pre: string, d: string, post: string) => {
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
