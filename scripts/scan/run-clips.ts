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
 *        [--rotation-fallback-distance D] [--pair-only]
 *
 * --pair-only restricts the rotation fallback to the 180-degree partner and is
 * only sound against a canonical bank (SCAN_CANONICAL_BANK=1) with an encoder
 * trained --canonical. The clips are pan footage, where pair-only measurably
 * loses stacked battlefields (verdict.log 2026-07-30) — it exists here for
 * experiments, not as a recommended bench configuration.
 */
import fs from "node:fs";
import path from "node:path";

import type {
  EmbedBank,
  EmbedKind,
  OpenCvLike,
  OrbCvLike,
  ScanSession,
} from "../../packages/shared/src/scan/index.js";
import {
  DEFAULT_SESSION_OPTIONS,
  createScanSession,
  gatesForEmbedDim,
} from "../../packages/shared/src/scan/index.js";
import { describe, loadCatalog } from "./catalog";
import { EMBED_SIZE, loadEmbedBank, nodeEmbedder } from "./embed-bank";
import { REPO_ROOT, listReferenceImages, loadImage } from "./lib";

const CLIPS = "/home/eiko/repos/openrift/data/image-recognition-test/clips/full";

/** Distinct cards each clip contains, as counted by hand. */
const EXPECTED: Record<string, number> = {
  "double-sleved-single-cards": 5,
  "binder-page": 9,
  "carelessly-stacking-battlefields": 12,
};

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

async function runClip(
  cv: OpenCvLike & OrbCvLike,
  clip: string,
  catalog: ReturnType<typeof loadCatalog>,
  verbose: boolean,
  embedKind: EmbedKind,
  bank: EmbedBank,
  maskFrame: boolean,
): Promise<void> {
  const dir = path.join(CLIPS, clip);
  const frames = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jpg"))
    .toSorted();

  const referenceFiles = new Map(listReferenceImages().map((r) => [r.key, r.file]));

  // Distance gates default per encoder; the bank's dimension says which
  // encoder built it (session.ts gatesForEmbedDim).
  const gates = gatesForEmbedDim(bank.keys.length > 0 ? bank.vectors.length / bank.keys.length : 0);
  const acceptMargin = Number(argValue("--margin") ?? DEFAULT_SESSION_OPTIONS.margin);
  const acceptOptions = {
    lockRun: Number(argValue("--lock-run") ?? DEFAULT_SESSION_OPTIONS.accept.lockRun),
    maxGapFrames: Number(argValue("--lock-gap") ?? DEFAULT_SESSION_OPTIONS.accept.maxGapFrames),
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
      embedImageSize: EMBED_SIZE,
      fetchReference: async (key) => {
        const file = referenceFiles.get(key);
        return file ? await loadImage(file) : null;
      },
    },
    {
      embedKind,
      topK: Number(argValue("--top-k") ?? gates.topK),
      candidatesToTry: Number(argValue("--tries") ?? DEFAULT_SESSION_OPTIONS.candidatesToTry),
      confidentDistance: Number(argValue("--confident-distance") ?? gates.confidentDistance),
      rotationMinFocus: Number(
        argValue("--rotation-min-focus") ?? DEFAULT_SESSION_OPTIONS.rotationMinFocus,
      ),
      rotationFallbackDistance: Number(
        argValue("--rotation-fallback-distance") ?? gates.rotationFallbackDistance,
      ),
      rotationPairOnly: process.argv.includes("--pair-only"),
      margin: acceptMargin,
      maskReferenceFrame: maskFrame,
      accept: acceptOptions,
    },
  );

  const sightings = new Map<string, Sighting>();
  let refusedFrames = 0;
  let totalMs = 0;

  for (const [i, file] of frames.entries()) {
    const image = await loadImage(path.join(dir, file));
    const startedAt = performance.now();

    const outcome = await session.processFrame(image, i, i / 30, () => performance.now());
    if (outcome.refused) {
      refusedFrames++;
    }
    if (outcome.winner) {
      record(sightings, catalog, outcome.winner.key, i / 30, outcome.winner.inliers, verbose);
      if (verbose && outcome.locked) {
        process.stdout.write(
          `      LOCK ${outcome.locked.label} after ${String(outcome.locked.framesToLock)} frames, ` +
            `inliers ${outcome.winner.inliers} vs rival ${outcome.winner.rivalInliers}\n`,
        );
      }
    }
    totalMs += performance.now() - startedAt;
  }

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
  const expected = EXPECTED[clip] ?? 0;
  process.stdout.write(
    `\n${clip}: ${frames.length} frames, ${(totalMs / frames.length).toFixed(0)}ms/frame\n` +
      `  ${artworks.size} distinct cards recognised at >=${MIN_SIGHTINGS} sightings ` +
      `(clip contains ${expected})\n  persistence curve: ${curve}\n`,
  );
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
      `gap ${acceptOptions.maxGapFrames}): ${locked.length} locked, ` +
      `${refusedFrames} frames refused\n`,
  );
  for (const track of locked) {
    process.stdout.write(
      `    lock ${(track.lockedAt ?? 0).toFixed(1).padStart(5)}s  ` +
        `${track.label.padEnd(46)} after ${String(track.framesToLock).padStart(3)} frames, ` +
        `seen ${String(track.sightings).padStart(3)}x\n`,
    );
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
  const bank = await loadEmbedBank(embedKind, process.argv.includes("--force-bank"));

  for (const clip of Object.keys(EXPECTED)) {
    if (only && clip !== only) {
      continue;
    }
    await runClip(cv, clip, catalog, verbose, embedKind, bank, maskFrame);
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
