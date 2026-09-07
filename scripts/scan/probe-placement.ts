/* oxlint-disable import/no-nodejs-modules -- standalone CLI tooling, never bundled */
/**
 * Replays a clip's frames through `createPlacementDetector` and prints every
 * settle event with the numbers the gates are cut from.
 *
 * Usage: bun scripts/scan/probe-placement.ts [--clip 3d-print-scanner] [--all]
 */
import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_PLACEMENT_OPTIONS,
  createPlacementDetector,
  centeredGuideQuad,
  toGray,
} from "../../packages/shared/src/scan/index.js";
import { CLIPS, EXPECTED_PLACEMENTS, loadImage } from "./lib";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function probeClip(clip: string): Promise<void> {
  const dir = path.join(CLIPS, clip);
  const frames = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jpg"))
    .toSorted();

  const detector = createPlacementDetector();
  let placed = 0;
  let ignored = 0;
  let disturbedFrames = 0;
  const rows: string[] = [];

  for (const [i, file] of frames.entries()) {
    const gray = toGray(await loadImage(path.join(dir, file)));
    const signal = detector.observe(gray, centeredGuideQuad(gray.width, gray.height));
    if (signal.disturbed) {
      disturbedFrames++;
    }
    if (!signal.settled) {
      continue;
    }
    if (signal.placed) {
      placed++;
    } else {
      ignored++;
    }
    rows.push(
      `    ${signal.placed ? "PLACED " : "ignored"} frame ${String(i + 1).padStart(4)}  ` +
        `disturbed ${String(signal.disturbedFrames).padStart(3)} frames  ` +
        `changed ${signal.changedDelta.toFixed(2).padStart(6)}`,
    );
  }

  const expected = EXPECTED_PLACEMENTS[clip];
  process.stdout.write(
    `\n${clip}: ${frames.length} frames, ${disturbedFrames} disturbed\n` +
      `  ${placed} placements detected` +
      `${expected === undefined ? "" : ` (clip contains ${expected})`}, ` +
      `${ignored} settles ignored\n`,
  );
  for (const row of rows) {
    process.stdout.write(`${row}\n`);
  }
}

async function main(): Promise<void> {
  process.stdout.write(`gates: ${JSON.stringify(DEFAULT_PLACEMENT_OPTIONS)}\n`);
  const only = argValue("--clip");
  const clips = process.argv.includes("--all")
    ? fs.readdirSync(CLIPS).filter((c) => fs.statSync(path.join(CLIPS, c)).isDirectory())
    : [only ?? "3d-print-scanner"];
  for (const clip of clips) {
    await probeClip(clip);
  }
}

await main();
