/* oxlint-disable import/no-nodejs-modules -- standalone CLI tooling, never bundled */
/* oxlint-disable promise/prefer-await-to-then, promise/always-return, promise/prefer-catch, promise/no-nesting, promise/prefer-await-to-callbacks, unicorn/prefer-top-level-await -- OpenCV's emscripten module deadlocks under Bun when awaited; its `then` must be called at the top level */
/**
 * Replays every real clip through the shared session pipeline (the same
 * `createScanSession` code the browser runs) and reports locked cards against
 * the counts each clip is known to contain.
 *
 * Usage: bun scripts/scan/run-clips.ts [--clip name] [--guide] [flags...].
 * See the argValue()/process.argv.includes() calls below for the full list.
 */
import fs from "node:fs";
import path from "node:path";

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

const SINGLE_MODE_TOP_K = 4;
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

interface PlacementStats {
  frames: number;
  /** IoU-with-guide buckets, in {@link IOU_BUCKETS} order. */
  buckets: number[];
  belowMinIou: number;
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

function quadArea(quad: Quad): number {
  let sum = 0;
  for (const [index, point] of quad.entries()) {
    const next = quad[(index + 1) % quad.length];
    sum += point.x * next.y - next.x * point.y;
  }
  return Math.abs(sum) / 2;
}

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
 * Same engine, separate accept state, with an unreachable lock run so it only
 * ever reports frame winners. Mirrors `createCatchUpSession` in the web hook.
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

  const counting = guided && clip in EXPECTED_PLACEMENTS;

  // bank.vectors.length / bank.keys.length recovers the embed dimension the
  // bank was built with, which selects the default distance gates.
  const gates = gatesForEmbedDim(bank.keys.length > 0 ? bank.vectors.length / bank.keys.length : 0);
  const acceptMargin = Number(argValue("--margin") ?? DEFAULT_SESSION_OPTIONS.margin);
  const acceptOptions = {
    lockRun: Number(
      argValue("--lock-run") ?? (guided ? GUIDE_LOCK_RUN : DEFAULT_SESSION_OPTIONS.accept.lockRun),
    ),
    maxGapFrames: Number(argValue("--lock-gap") ?? DEFAULT_SESSION_OPTIONS.accept.maxGapFrames),
    // Guide-mode only: pan has no placement detector to gate a re-lock on.
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

  const trace = process.argv.includes("--trace");
  const detector = createPlacementDetector();
  const rearmOnPlacement = counting && !process.argv.includes("--no-rearm");
  const skipDisturbed = counting && !process.argv.includes("--no-skip-disturbed");
  const dropTo = argValue("--drop-to") ? Number(argValue("--drop-to")) : null;
  const frameStride = dropTo ? Math.max(1, Math.round(30 / dropTo)) : 1;

  let placements = 0;
  let processed = 0;
  let skipped = 0;
  let lockEvents = 0;
  const lockLog: string[] = [];
  let unlockedSincePlacement = 0;
  let missedPlacements = 0;
  let nextProcessableFrame = 0;
  // Second look (apps/web/src/lib/scan-catchup.ts): replays the settled
  // frame through a never-locking session once the placement is written off.
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
        pendingFrame = image;
        if (rearmOnPlacement) {
          session.rearm();
        }
      }
    }

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

    // `processed - 1`, not `i`: `maxGapFrames` counts in the processed-frame
    // index, matching what the web hook passes.
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
    process.stdout.write("  (run with --guide to score how many cards were counted)\n");
  }
  for (const sighting of distinct) {
    process.stdout.write(
      `    ${sighting.firstSeen.toFixed(1).padStart(5)}s  ${sighting.label.padEnd(46)} ` +
        `seen ${String(sighting.count).padStart(3)}x\n`,
    );
  }

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

// require, not dynamic import: Bun's `await import()` adopts the npm dist's
// emscripten thenable and spins the microtask queue at 100% CPU forever.
const customOpenCv = path.join(REPO_ROOT, "data/image-recognition-test/models/opencv/opencv.js");
const useCustomOpenCv = fs.existsSync(customOpenCv);
process.stdout.write(
  `opencv: ${useCustomOpenCv ? "custom trimmed build" : "@techstark/opencv-js dist"}\n`,
);
// oxlint-disable-next-line import/no-commonjs, typescript/no-require-imports -- see the require-not-import note above
const cvModule = useCustomOpenCv ? require(customOpenCv) : require("@techstark/opencv-js");

(cvModule as unknown as { then: (fn: (cv: OpenCvLike & OrbCvLike) => void) => void }).then((cv) => {
  main(cv).then(
    () => process.exit(0),
    (error: unknown) => {
      process.stderr.write(`${String(error)}\n`);
      process.exit(1);
    },
  );
});
