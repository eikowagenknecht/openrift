/* oxlint-disable import/no-nodejs-modules -- standalone CLI tooling, never bundled */
/* oxlint-disable promise/prefer-await-to-then, promise/always-return, promise/prefer-catch, promise/no-nesting, promise/prefer-await-to-callbacks, unicorn/prefer-top-level-await -- OpenCV's emscripten module deadlocks under Bun when awaited; its `then` must be called at the top level */
/**
 * Replay every real clip through the shared session pipeline and report the
 * locked cards, against the counts the clips are known to contain.
 *
 * This is the regression bench for the shipping engine: it drives exactly the
 * `createScanSession` code the browser runs, with onnxruntime-node standing in
 * for onnxruntime-web.
 *
 * Usage: bun scripts/scan/run-clips.ts [--clip binder-page] [--verbose]
 *        [--art-crop] [--mask-frame] [--min-sightings N] [--top-k N]
 *        [--tries N] [--margin M] [--lock-run N] [--lock-gap N] [--force-bank]
 *        [--confident-distance D] [--rotation-min-focus N]
 *        [--rotation-fallback-distance D] [--pair-only] [--guide]
 *        [--no-rearm] [--no-skip-disturbed] [--no-weighted]
 *        [--no-relock-gate] [--drop-to N] [--trace]
 *
 * --guide anchors detection to the same centered rect the single-card modes
 * draw in the app (`centeredGuideQuad`). Off by default, so the bench keeps
 * measuring the pan pipeline; it also configures the rest of what the web
 * hook sets for single mode (shortlist 4, 3-frame run, pair-only rotation
 * against a canonical bank). The placement report is printed either way, and
 * guide-free it says how many frames the guide filter would have thrown away.
 *
 * --pair-only restricts the rotation fallback to the 180-degree partner and is
 * only sound against a canonical bank (SCAN_CANONICAL_BANK=1) with an encoder
 * trained --canonical. The clips are pan footage, where pair-only measurably
 * loses stacked battlefields (verdict.log 2026-07-30) — it exists here for
 * experiments, not as a recommended bench configuration.
 *
 * Two scores, because the clips ask two different questions:
 *
 * - **Coverage** (every clip, always): how many of the distinct cards in the
 *   clip were locked, against EXPECTED_CARDS.
 * - **Throughput** (--guide, clips in EXPECTED_PLACEMENTS): how many of the
 *   cards laid down were counted. The same artwork placed six times must lock
 *   six times, so this one counts lock events, not distinct artworks.
 *
 * Under --guide the run also drives the placement detector on every frame, the
 * way the phone drives it on every camera frame, which is what makes repeated
 * copies countable at all. --no-rearm, --no-relock-gate and --no-weighted turn
 * the individual parts off to reproduce the pre-2026-08-02 behaviour, and
 * --drop-to N models a device that can only process N frames a second (the
 * clips are 30 fps, phones manage 5-15).
 */
import fs from "node:fs";
import path from "node:path";

// The web app's catch-up rule, shared so the bench scores the shipping
// decision rather than a copy of it.
import type { CatchUpVerdict } from "../../apps/web/src/lib/scan-catchup.js";
import { catchUpVerdict } from "../../apps/web/src/lib/scan-catchup.js";
import type {
  EmbedBank,
  EmbedKind,
  OpenCvLike,
  OrbCvLike,
  Quad,
  RgbaImage,
  ScanSession,
} from "../../packages/shared/src/scan/index.js";
import {
  DEFAULT_SESSION_OPTIONS,
  GUIDE_MIN_IOU,
  centeredGuideQuad,
  createPlacementDetector,
  createScanSession,
  gatesForEmbedDim,
  quadIou,
  toGray,
} from "../../packages/shared/src/scan/index.js";
import { describe, loadCatalog } from "./catalog";
import { CANONICAL_BANK, EMBED_SIZE, loadEmbedBank, nodeEmbedder } from "./embed-bank";
import {
  CLIPS,
  EXPECTED_CARDS,
  EXPECTED_PLACEMENTS,
  REPO_ROOT,
  listReferenceImages,
  loadImage,
} from "./lib";

/** Shortlist cap the scanning page applies in single-card mode. */
const SINGLE_MODE_TOP_K = 4;
/** Agreeing frames a guide-mode lock needs, matching the page. */
const GUIDE_LOCK_RUN = 3;

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

interface Sighting {
  key: string;
  label: string;
  firstSeen: number;
  count: number;
  bestScore: number;
}

/**
 * How the settled candidates sat relative to the guide rect, whether or not
 * the guide was actually in play.
 *
 * The bench runs guide-free by default, so this is what says whether turning
 * the guide on would have thrown the real card away: `belowMinIou` counts the
 * frames whose candidate the guide filter would have dropped.
 */
interface PlacementStats {
  frames: number;
  /** IoU-with-guide buckets, in {@link IOU_BUCKETS} order. */
  buckets: number[];
  belowMinIou: number;
  /** Frames whose candidate was exactly the guide rect (guide-mode fallback). */
  guideFallback: number;
  iouSum: number;
  containmentSum: number;
}

const IOU_BUCKETS = [0.1, 0.2, 0.3, 0.5, 0.7];

function createPlacementStats(): PlacementStats {
  return {
    frames: 0,
    buckets: Array.from({ length: IOU_BUCKETS.length + 1 }, () => 0),
    belowMinIou: 0,
    guideFallback: 0,
    iouSum: 0,
    containmentSum: 0,
  };
}

/**
 * Absolute shoelace area of a quad.
 *
 * @returns The area in the quad's own coordinate space.
 */
function quadArea(quad: Quad): number {
  let sum = 0;
  for (const [index, point] of quad.entries()) {
    const next = quad[(index + 1) % quad.length];
    sum += point.x * next.y - next.x * point.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Fold one frame's settled candidate into the placement stats.
 *
 * Containment (intersection over candidate area) is recovered from the IoU
 * and the two areas rather than re-clipping the polygons: for
 * `iou = i / (a + b - i)` the intersection is `iou * (a + b) / (1 + iou)`.
 *
 * @returns Nothing; the stats are updated in place.
 */
function recordPlacement(stats: PlacementStats, quad: Quad, width: number, height: number): void {
  const guide = centeredGuideQuad(width, height);
  const iou = quadIou(quad, guide);
  const candidateArea = quadArea(quad);
  const guideArea = quadArea(guide);
  const intersection = (iou * (candidateArea + guideArea)) / (1 + iou);

  stats.frames++;
  stats.iouSum += iou;
  stats.containmentSum += candidateArea > 0 ? intersection / candidateArea : 0;
  if (iou < GUIDE_MIN_IOU) {
    stats.belowMinIou++;
  }
  if (quad.every((point, index) => point.x === guide[index].x && point.y === guide[index].y)) {
    stats.guideFallback++;
  }
  const bucket = IOU_BUCKETS.findIndex((edge) => iou < edge);
  stats.buckets[bucket === -1 ? IOU_BUCKETS.length : bucket]++;
}

/**
 * Render the placement stats as two report lines.
 *
 * @returns The lines, or an empty string when no frame settled a candidate.
 */
function formatPlacement(stats: PlacementStats): string {
  if (stats.frames === 0) {
    return "";
  }
  const labels = ["<0.1", "0.1-0.2", "0.2-0.3", "0.3-0.5", "0.5-0.7", ">=0.7"];
  const histogram = stats.buckets.map((count, index) => `${labels[index]}: ${count}`).join("  ");
  const share = ((stats.belowMinIou / stats.frames) * 100).toFixed(0);
  return (
    `  placement vs guide (${stats.frames} frames with a candidate): ` +
    `mean IoU ${(stats.iouSum / stats.frames).toFixed(2)}, ` +
    `mean containment ${(stats.containmentSum / stats.frames).toFixed(2)}, ` +
    `${stats.belowMinIou} below the ${GUIDE_MIN_IOU} filter (${share}%), ` +
    `${stats.guideFallback} guide-fallback frames\n` +
    `    IoU histogram: ${histogram}\n`
  );
}

/**
 * A second session for the catch-up pass: same engine, separate accept state,
 * and a lock run no single frame can reach, so it only ever reports frame
 * winners. Mirrors `createCatchUpSession` in the web hook.
 *
 * @returns The session; release it when the clip is done.
 */
function createCatchUpSession(
  cv: OpenCvLike & OrbCvLike,
  catalog: ReturnType<typeof loadCatalog>,
  bank: EmbedBank,
  gates: ReturnType<typeof gatesForEmbedDim>,
  referenceFiles: Map<string, string>,
): ScanSession {
  return createScanSession(
    {
      cv,
      embedder: nodeEmbedder,
      bank,
      artKeyOf: (key) => catalog.get(key)?.artKey ?? key,
      labelOf: (key) => describe(catalog, key),
      cardTypeOf: (key) => catalog.get(key)?.cardType,
      publicCodeOf: (key) => catalog.get(key)?.publicCode,
      markersOf: (key) => catalog.get(key)?.markers ?? undefined,
      languageOf: (key) => catalog.get(key)?.language,
      embedImageSize: EMBED_SIZE,
      fetchReference: async (key) => {
        const file = referenceFiles.get(key);
        return file ? await loadImage(file) : null;
      },
    },
    {
      topK: Math.min(gates.topK, SINGLE_MODE_TOP_K),
      confidentDistance: gates.confidentDistance,
      rotationFallbackDistance: gates.rotationFallbackDistance,
      rotationPairOnly: CANONICAL_BANK,
      guideFor: centeredGuideQuad,
      accept: { lockRun: Number.POSITIVE_INFINITY, maxGapFrames: 0 },
    },
  );
}

/**
 * Re-recognise one held frame and say what should happen to it.
 *
 * @returns The catch-up verdict for the frame.
 */
async function secondLook(
  session: ScanSession,
  frame: RgbaImage,
  frameIndex: number,
  gates: ReturnType<typeof gatesForEmbedDim>,
): Promise<CatchUpVerdict> {
  void gates;
  const outcome = await session.processFrame(frame, frameIndex, frameIndex / 30, () =>
    performance.now(),
  );
  return catchUpVerdict(
    outcome.winner,
    DEFAULT_SESSION_OPTIONS.minInliers,
    DEFAULT_SESSION_OPTIONS.margin,
  );
}

async function runClip(
  cv: OpenCvLike & OrbCvLike,
  clip: string,
  catalog: ReturnType<typeof loadCatalog>,
  verbose: boolean,
  embedKind: EmbedKind,
  bank: EmbedBank,
  maskFrame: boolean,
  guided: boolean,
): Promise<void> {
  const dir = path.join(CLIPS, clip);
  const frames = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jpg"))
    .toSorted();

  const referenceFiles = new Map(listReferenceImages().map((r) => [r.key, r.file]));

  // The throughput score only means anything in guide mode, and only for a
  // clip whose placements were counted by hand.
  const counting = guided && clip in EXPECTED_PLACEMENTS;

  // Distance gates default per encoder; the bank's dimension says which
  // encoder built it (session.ts gatesForEmbedDim).
  const gates = gatesForEmbedDim(bank.keys.length > 0 ? bank.vectors.length / bank.keys.length : 0);
  const acceptMargin = Number(argValue("--margin") ?? DEFAULT_SESSION_OPTIONS.margin);
  const acceptOptions = {
    lockRun: Number(
      argValue("--lock-run") ?? (guided ? GUIDE_LOCK_RUN : DEFAULT_SESSION_OPTIONS.accept.lockRun),
    ),
    maxGapFrames: Number(argValue("--lock-gap") ?? DEFAULT_SESSION_OPTIONS.accept.maxGapFrames),
    // Both are guide-mode behaviour: pan has no placement detector to gate a
    // re-lock on, and its 4-frame run is what keeps false locks at zero.
    weighted: guided && !process.argv.includes("--no-weighted"),
    relockOnlyAfterRearm: guided && !process.argv.includes("--no-relock-gate"),
  };
  const session: ScanSession = createScanSession(
    {
      cv,
      embedder: nodeEmbedder,
      bank,
      artKeyOf: (key) => catalog.get(key)?.artKey ?? key,
      labelOf: (key) => describe(catalog, key),
      cardTypeOf: (key) => catalog.get(key)?.cardType,
      publicCodeOf: (key) => catalog.get(key)?.publicCode,
      markersOf: (key) => catalog.get(key)?.markers ?? undefined,
      languageOf: (key) => catalog.get(key)?.language,
      embedImageSize: EMBED_SIZE,
      fetchReference: async (key) => {
        const file = referenceFiles.get(key);
        return file ? await loadImage(file) : null;
      },
    },
    {
      embedKind,
      topK: Number(
        argValue("--top-k") ?? (guided ? Math.min(gates.topK, SINGLE_MODE_TOP_K) : gates.topK),
      ),
      candidatesToTry: Number(argValue("--tries") ?? DEFAULT_SESSION_OPTIONS.candidatesToTry),
      confidentDistance: Number(argValue("--confident-distance") ?? gates.confidentDistance),
      rotationMinFocus: Number(
        argValue("--rotation-min-focus") ?? DEFAULT_SESSION_OPTIONS.rotationMinFocus,
      ),
      rotationFallbackDistance: Number(
        argValue("--rotation-fallback-distance") ?? gates.rotationFallbackDistance,
      ),
      // The page pairs guide mode with a canonical bank; the bench knows the
      // bank's frame from the env the cache was built under.
      rotationPairOnly: process.argv.includes("--pair-only") || (guided && CANONICAL_BANK),
      margin: acceptMargin,
      maskReferenceFrame: maskFrame,
      accept: acceptOptions,
      ...(guided ? { guideFor: centeredGuideQuad } : {}),
    },
  );

  const sightings = new Map<string, Sighting>();
  let refusedFrames = 0;
  let totalMs = 0;
  const placement = createPlacementStats();

  // The placement detector runs on every frame, the way the phone runs it on
  // every camera frame: it is the cheap eye that has to out-sample the
  // recognition pipeline, or a card dealt onto a pile is gone before anything
  // notices the pile changed.
  const trace = process.argv.includes("--trace");
  const detector = createPlacementDetector();
  const rearmOnPlacement = counting && !process.argv.includes("--no-rearm");
  const skipDisturbed = counting && !process.argv.includes("--no-skip-disturbed");
  // Frames a second the pipeline is allowed to process, against the clip's 30.
  // Unset means "process every frame", which no phone can do.
  const dropTo = argValue("--drop-to") ? Number(argValue("--drop-to")) : null;
  const frameStride = dropTo ? Math.max(1, Math.round(30 / dropTo)) : 1;

  let placements = 0;
  let processed = 0;
  let skipped = 0;
  let lockEvents = 0;
  const lockLog: string[] = [];
  // Placements still waiting for something to lock; a placement that never
  // does is a card the user put down and the session did not count.
  let unlockedSincePlacement = 0;
  let missedPlacements = 0;
  let nextProcessableFrame = 0;
  // The second look (see apps/web/src/lib/scan-catchup.ts): the frame each
  // placement settled on, replayed through a never-locking session once the
  // placement is written off. A single frame cannot earn a run, so the verdict
  // comes from the frame's own evidence.
  const catchUp = !process.argv.includes("--no-catch-up");
  let pendingFrame: RgbaImage | null = null;
  let recovered = 0;
  let recoveredAsk = 0;
  const catchUpSession: ScanSession | null =
    counting && catchUp ? createCatchUpSession(cv, catalog, bank, gates, referenceFiles) : null;

  for (const [i, file] of frames.entries()) {
    const image = await loadImage(path.join(dir, file));
    const startedAt = performance.now();

    let disturbed = false;
    if (counting) {
      const signal = detector.observe(toGray(image), centeredGuideQuad(image.width, image.height));
      disturbed = signal.disturbed;
      if (signal.placed) {
        placements++;
        if (unlockedSincePlacement > 0) {
          missedPlacements++;
          // The card is gone, but the frame it settled on is not: give it the
          // frame slot the live pass never had.
          if (catchUpSession && pendingFrame) {
            const verdict = await secondLook(catchUpSession, pendingFrame, i, gates);
            if (verdict === "add") {
              recovered++;
            } else if (verdict === "ask") {
              recoveredAsk++;
            }
          }
        }
        unlockedSincePlacement = 1;
        // The settle frame is the sharpest view of this card there will be.
        pendingFrame = image;
        if (rearmOnPlacement) {
          session.rearm();
        }
      }
    }

    // A disturbed frame is mid-swap: motion-blurred, half-occluded, or showing
    // two cards at once. Processing it buys nothing and costs a whole frame
    // slot, which on a phone is the scarcest thing there is.
    if (disturbed && skipDisturbed) {
      skipped++;
      totalMs += performance.now() - startedAt;
      continue;
    }
    if (i < nextProcessableFrame) {
      skipped++;
      totalMs += performance.now() - startedAt;
      continue;
    }
    nextProcessableFrame = i + frameStride;
    processed++;

    // The frame INDEX is the processed-frame counter, not the clip position:
    // that is what the web hook passes, and `maxGapFrames` is counted in it.
    // Feeding clip positions here would make a skipped frame widen every gap,
    // so a budgeted run would break runs the phone would keep.
    const outcome = await session.processFrame(image, processed - 1, i / 30, () =>
      performance.now(),
    );
    if (trace) {
      const top = outcome.ranked[0];
      process.stdout.write(
        `    #${String(i + 1).padStart(4)} ${outcome.timings.total.toFixed(0).padStart(4)}ms ` +
          `focus ${outcome.focus.toFixed(0).padStart(4)} ` +
          `${top ? `top ${describe(catalog, top.key).padEnd(44)} d${top.distance.toFixed(3)} r${top.rotation}` : "no-candidate".padEnd(58)} ` +
          `${outcome.winner ? `WIN ${outcome.winner.inliers} vs ${outcome.winner.rivalInliers}` : `${outcome.refused ? "refused " : ""}best-inliers ${outcome.bestInliers}`}\n`,
      );
    }
    if (outcome.refused) {
      refusedFrames++;
    }
    if (outcome.candidate) {
      recordPlacement(placement, outcome.candidate.quad, image.width, image.height);
    }
    if (outcome.winner) {
      record(sightings, catalog, outcome.winner.key, i / 30, outcome.winner.inliers, verbose);
      if (outcome.locked) {
        lockEvents++;
        unlockedSincePlacement = 0;
        pendingFrame = null;
        lockLog.push(
          `    lock ${(i / 30).toFixed(1).padStart(5)}s  ${outcome.locked.label.padEnd(46)} ` +
            `after ${String(outcome.locked.framesToLock).padStart(3)} frames, ` +
            `inliers ${outcome.winner.inliers} vs rival ${outcome.winner.rivalInliers}`,
        );
        if (verbose) {
          process.stdout.write(`      LOCK ${lockLog.at(-1)?.trim() ?? ""}\n`);
        }
      }
    }
    totalMs += performance.now() - startedAt;
  }
  if (unlockedSincePlacement > 0) {
    missedPlacements++;
    if (catchUpSession && pendingFrame) {
      const verdict = await secondLook(catchUpSession, pendingFrame, frames.length, gates);
      if (verdict === "add") {
        recovered++;
      } else if (verdict === "ask") {
        recoveredAsk++;
      }
    }
  }
  catchUpSession?.release();

  // Persistence view, kept for continuity with the audit-era numbers: how many
  // distinct artworks were seen at least N times, before the accept layer's
  // stricter run requirement.
  const MIN_SIGHTINGS = Number(argValue("--min-sightings") ?? 4);
  const all = [...sightings.values()].toSorted((a, b) => a.firstSeen - b.firstSeen);
  const distinct = all.filter((s) => s.count >= MIN_SIGHTINGS);
  const curve = [2, 3, 4, 5, 6, 8]
    .map((n) => {
      const kept = all.filter((s) => s.count >= n);
      const arts = new Set(kept.map((s) => catalog.get(s.key)?.artKey ?? s.key));
      return `>=${n}: ${arts.size}`;
    })
    .join("  ");
  // The same artwork in two languages is one physical card, so collapse them.
  const artworks = new Set(distinct.map((s) => catalog.get(s.key)?.artKey ?? s.key));
  process.stdout.write(
    `\n${clip}: ${frames.length} frames` +
      `${guided ? ` (guide mode), ${processed} processed, ${skipped} skipped` : ""}, ` +
      `${(totalMs / Math.max(1, processed)).toFixed(0)}ms/processed frame\n` +
      `  ${artworks.size} distinct cards recognised at >=${MIN_SIGHTINGS} sightings ` +
      `(clip contains ${EXPECTED_CARDS[clip] ?? 0})\n  persistence curve: ${curve}\n` +
      `${formatPlacement(placement)}`,
  );
  if (counting) {
    // The throughput score: cards laid down against cards counted. Locks, not
    // distinct artworks — five copies of one card is five cards.
    process.stdout.write(
      `  SCORE ${lockEvents} counted / ${EXPECTED_PLACEMENTS[clip]} placed ` +
        `(detector saw ${placements}, ${missedPlacements} placements went uncounted)\n` +
        `  second look: ${recovered} recovered outright, ${recoveredAsk} left for the user` +
        `${catchUp ? "" : " (OFF)"}\n` +
        `  mode: guide, rearm ${rearmOnPlacement ? "on" : "OFF"}, ` +
        `skip-disturbed ${skipDisturbed ? "on" : "OFF"}, ` +
        `relock-gate ${acceptOptions.relockOnlyAfterRearm ? "on" : "OFF"}, ` +
        `weighted ${acceptOptions.weighted ? "on" : "OFF"}` +
        `${dropTo ? `, budget ${dropTo}fps (stride ${frameStride})` : ""}\n`,
    );
  } else if (clip in EXPECTED_PLACEMENTS) {
    // The clip's placements were counted by hand, but this run cannot score
    // them: without the guide there is nothing to watch for a card landing.
    process.stdout.write("  (run with --guide to score how many cards were counted)\n");
  }
  for (const sighting of distinct) {
    process.stdout.write(
      `    ${sighting.firstSeen.toFixed(1).padStart(5)}s  ${sighting.label.padEnd(46)} ` +
        `seen ${String(sighting.count).padStart(3)}x\n`,
    );
  }

  // The accept layer is the score: locked cards, frames-to-lock, refusals,
  // near-misses.
  const locked = [...session.state.values()]
    .filter((t) => t.lockedAt !== null)
    .toSorted((a, b) => (a.lockedAt ?? 0) - (b.lockedAt ?? 0));
  process.stdout.write(
    `  accept layer (margin ${acceptMargin}, run ${acceptOptions.lockRun}, ` +
      `gap ${acceptOptions.maxGapFrames}): ${lockEvents} lock events over ` +
      `${locked.length} artworks, ${refusedFrames} frames refused\n`,
  );
  for (const line of lockLog) {
    process.stdout.write(`${line}\n`);
  }
  for (const track of [...session.state.values()].filter(
    (t) => t.lockedAt === null && t.sightings >= 3,
  )) {
    process.stdout.write(
      `    near ${track.firstSeen.toFixed(1).padStart(5)}s  ${track.label.padEnd(46)} ` +
        `seen ${String(track.sightings).padStart(3)}x, best run ${track.maxRunLength}\n`,
    );
  }

  session.release();
}

/**
 * Note a recognised card, keeping the first time it was seen.
 *
 * @returns Nothing; the map is updated in place.
 */
function record(
  sightings: Map<string, Sighting>,
  catalog: ReturnType<typeof loadCatalog>,
  key: string,
  seconds: number,
  score: number,
  verbose: boolean,
): void {
  const existing = sightings.get(key);
  if (existing) {
    existing.count++;
    existing.bestScore = Math.max(existing.bestScore, score);
    return;
  }
  sightings.set(key, {
    key,
    label: describe(catalog, key),
    firstSeen: seconds,
    count: 1,
    bestScore: score,
  });
  if (verbose) {
    process.stdout.write(`    ${seconds.toFixed(1).padStart(5)}s ${describe(catalog, key)}\n`);
  }
}

async function main(cv: OpenCvLike & OrbCvLike): Promise<void> {
  const catalog = loadCatalog();
  const only = argValue("--clip");
  const verbose = process.argv.includes("--verbose");
  const embedKind: EmbedKind = process.argv.includes("--art-crop") ? "art" : "card";
  const maskFrame = process.argv.includes("--mask-frame");
  const guided = process.argv.includes("--guide");
  const bank = await loadEmbedBank(embedKind, process.argv.includes("--force-bank"));

  for (const clip of Object.keys(EXPECTED_CARDS)) {
    if (only && clip !== only) {
      continue;
    }
    await runClip(cv, clip, catalog, verbose, embedKind, bank, maskFrame, guided);
  }
}

// The trimmed custom build (scripts/scan/build-opencv.sh) is what the page
// serves, so the bench prefers it; the npm dist remains the fallback so a
// fresh checkout can bench without a docker build. Printed, so a result is
// never silently attributed to the wrong binary.
//
// require, NOT dynamic import: Bun's `await import()` interop adopts the
// emscripten export — for the npm dist a booby-trapped thenable whose adoption
// spins the microtask queue at 100% CPU forever (measured: 9 h with zero
// output, 2026-07-31). require hands back module.exports untouched; the one
// manual `then` below is the only safe way to unwrap it. The static
// `import cvModule from ...` this replaced was equally safe but cannot be
// made conditional.
const customOpenCv = path.join(REPO_ROOT, "data/image-recognition-test/models/opencv/opencv.js");
const useCustomOpenCv = fs.existsSync(customOpenCv);
process.stdout.write(
  `opencv: ${useCustomOpenCv ? "custom trimmed build" : "@techstark/opencv-js dist"}\n`,
);
// oxlint-disable-next-line import/no-commonjs, typescript/no-require-imports -- see the require-not-import note above
const cvModule = useCustomOpenCv ? require(customOpenCv) : require("@techstark/opencv-js");

// Under Bun, awaiting the emscripten module deadlocks; calling its `then` at
// the top level resolves normally.
(cvModule as unknown as { then: (fn: (cv: OpenCvLike & OrbCvLike) => void) => void }).then((cv) => {
  main(cv).then(
    () => process.exit(0),
    (error: unknown) => {
      process.stderr.write(`${String(error)}\n`);
      process.exit(1);
    },
  );
});
