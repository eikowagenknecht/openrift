// Offline calibration probe for printing disambiguation. Temporary analysis
// tool; run with: bun scripts/scan/probe-disambiguation.ts
import type { GrayImage, PrintingSignature } from "../../packages/shared/src/scan/index.js";
import {
  bestShiftCorrelation,
  discriminativeMargin,
  printingSignature,
  textBandForType,
} from "../../packages/shared/src/scan/index.js";
import { loadCatalog } from "./catalog";
import { listReferenceImages, loadImage } from "./lib";

const catalog = loadCatalog();
const files = new Map(listReferenceImages().map((r) => [r.key, r.file]));

const groups = new Map<string, string[]>();
for (const [key, entry] of catalog) {
  const artKey = entry.artKey ?? key;
  groups.set(artKey, [...(groups.get(artKey) ?? []), key]);
}

function shifted(signature: GrayImage, dx: number, dy: number): GrayImage {
  const { width, height } = signature;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(height - 1, Math.max(0, y + dy));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(width - 1, Math.max(0, x + dx));
      data[y * width + x] = signature.data[sy * width + sx];
    }
  }
  return { data, width, height };
}

const nameCorrectMargin1: number[] = [];
const nameCorrectMargin2: number[] = [];
const nameWrongMargin1: number[] = [];
const codeFloorSelf1: number[] = [];
const codeFloorWrong: number[] = [];
const codeCorrectMargin1: number[] = [];
const codeCorrectMargin2: number[] = [];
const codeWrongMargin1: number[] = [];
const codeSameCodeEvidence: number[] = [];
let codeSameCodePairs = 0;
let codeDiffCodeNull = 0;
let codeDiffCodePairs = 0;
let sameLanguageMultiCodeGroups = 0;
let groupsProbed = 0;

for (const [, keys] of groups) {
  if (keys.length < 2 || groupsProbed >= 120) {
    continue;
  }
  const signatures: { key: string; publicCode: string; language: string; s: PrintingSignature }[] =
    [];
  for (const key of keys.slice(0, 4)) {
    const file = files.get(key);
    const entry = catalog.get(key);
    if (!file || !entry) {
      continue;
    }
    const s = printingSignature(await loadImage(file), textBandForType(entry.cardType));
    if (s) {
      signatures.push({ key, publicCode: entry.publicCode, language: entry.language, s });
    }
  }
  if (signatures.length < 2) {
    continue;
  }
  groupsProbed++;
  const languages = new Set(signatures.map((entry) => entry.language));
  const codes = new Set(signatures.map((entry) => entry.publicCode));
  if (languages.size === 1 && codes.size > 1) {
    sameLanguageMultiCodeGroups++;
  }

  const a = signatures[0];
  const b = signatures[1];
  const nameQuery1 = shifted(a.s.name, 1, 1);
  const nameQuery2 = shifted(a.s.name, 2, 2);
  const nameCorrect1 = discriminativeMargin(nameQuery1, a.s.name, b.s.name);
  const nameCorrect2 = discriminativeMargin(nameQuery2, a.s.name, b.s.name);
  const nameWrong1 = discriminativeMargin(nameQuery1, b.s.name, a.s.name);
  if (nameCorrect1 !== null) {
    nameCorrectMargin1.push(nameCorrect1);
  }
  if (nameCorrect2 !== null) {
    nameCorrectMargin2.push(nameCorrect2);
  }
  if (nameWrong1 !== null) {
    nameWrongMargin1.push(nameWrong1);
  }

  for (let i = 0; i < signatures.length; i++) {
    for (let j = i + 1; j < signatures.length; j++) {
      const left = signatures[i];
      const right = signatures[j];
      if (!left.s.code || !right.s.code) {
        continue;
      }
      const query1 = shifted(left.s.code, 1, 1);
      const margin = discriminativeMargin(query1, left.s.code, right.s.code);
      if (left.publicCode === right.publicCode) {
        codeSameCodePairs++;
        if (margin !== null) {
          codeSameCodeEvidence.push(margin);
        }
        continue;
      }
      codeDiffCodePairs++;
      if (margin === null) {
        codeDiffCodeNull++;
        continue;
      }
      codeCorrectMargin1.push(margin);
      const margin2 = discriminativeMargin(shifted(left.s.code, 2, 2), left.s.code, right.s.code);
      if (margin2 !== null) {
        codeCorrectMargin2.push(margin2);
      }
      const wrong = discriminativeMargin(query1, right.s.code, left.s.code);
      if (wrong !== null) {
        codeWrongMargin1.push(wrong);
      }
      codeFloorSelf1.push(bestShiftCorrelation(query1, left.s.code).score);
      codeFloorWrong.push(bestShiftCorrelation(query1, right.s.code).score);
    }
  }
}

function summary(values: number[]): string {
  const sorted = values.toSorted((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
  return `n=${values.length} min=${sorted[0]?.toFixed(3)} median=${median.toFixed(3)} max=${sorted.at(-1)?.toFixed(3)}`;
}

console.log(
  `groups probed: ${groupsProbed} (same-language multi-code: ${sameLanguageMultiCodeGroups})`,
);
console.log(`name discriminative, correct side, 1px shift  ${summary(nameCorrectMargin1)}`);
console.log(`name discriminative, correct side, 2px shift  ${summary(nameCorrectMargin2)}`);
console.log(`name discriminative, wrong side, 1px shift    ${summary(nameWrongMargin1)}`);
console.log(
  `code same-code pairs: ${codeSameCodePairs}, false evidence ${summary(codeSameCodeEvidence)}`,
);
console.log(`code diff-code pairs: ${codeDiffCodePairs}, no-evidence (null): ${codeDiffCodeNull}`);
console.log(`code discriminative, correct side, 1px shift  ${summary(codeCorrectMargin1)}`);
console.log(`code discriminative, correct side, 2px shift  ${summary(codeCorrectMargin2)}`);
console.log(`code discriminative, wrong side, 1px shift    ${summary(codeWrongMargin1)}`);
console.log(`code whole-strip floor, self 1px shift        ${summary(codeFloorSelf1)}`);
console.log(`code whole-strip floor, wrong code            ${summary(codeFloorWrong)}`);

const stampCorrectMargin1: number[] = [];
const stampCorrectMargin2: number[] = [];
const stampWrongMargin1: number[] = [];
const stampFloorSelf1: number[] = [];
const stampFloorWrong: number[] = [];
const stampSameMarkerEvidence: number[] = [];
let stampSameMarkerPairs = 0;
let stampDiffMarkerPairs = 0;
let stampDiffMarkerNull = 0;
let stampGroupsProbed = 0;

for (const [, keys] of groups) {
  if (keys.length < 2) {
    continue;
  }
  const entries = keys.flatMap((key) => {
    const entry = catalog.get(key);
    const file = files.get(key);
    return entry && file ? [{ entry, file }] : [];
  });
  const hasStampPair = entries.some((a) =>
    entries.some(
      (b) =>
        a !== b &&
        a.entry.publicCode === b.entry.publicCode &&
        a.entry.language === b.entry.language &&
        a.entry.markers !== null &&
        b.entry.markers !== null &&
        a.entry.markers !== b.entry.markers,
    ),
  );
  if (!hasStampPair) {
    continue;
  }
  const signatures: { markers: string; stamp: GrayImage }[] = [];
  for (const { entry, file } of entries.slice(0, 4)) {
    if (entry.markers === null) {
      continue;
    }
    const s = printingSignature(await loadImage(file), textBandForType(entry.cardType));
    if (s?.stamp) {
      signatures.push({ markers: entry.markers, stamp: s.stamp });
    }
  }
  if (signatures.length < 2) {
    continue;
  }
  stampGroupsProbed++;
  for (let i = 0; i < signatures.length; i++) {
    for (let j = i + 1; j < signatures.length; j++) {
      const left = signatures[i];
      const right = signatures[j];
      const query1 = shifted(left.stamp, 1, 1);
      const margin = discriminativeMargin(query1, left.stamp, right.stamp);
      if ((left.markers === "") === (right.markers === "")) {
        stampSameMarkerPairs++;
        if (margin !== null) {
          stampSameMarkerEvidence.push(margin);
        }
        continue;
      }
      stampDiffMarkerPairs++;
      if (margin === null) {
        stampDiffMarkerNull++;
        continue;
      }
      stampCorrectMargin1.push(margin);
      const margin2 = discriminativeMargin(shifted(left.stamp, 2, 2), left.stamp, right.stamp);
      if (margin2 !== null) {
        stampCorrectMargin2.push(margin2);
      }
      const wrong = discriminativeMargin(query1, right.stamp, left.stamp);
      if (wrong !== null) {
        stampWrongMargin1.push(wrong);
      }
      stampFloorSelf1.push(bestShiftCorrelation(query1, left.stamp).score);
      stampFloorWrong.push(bestShiftCorrelation(query1, right.stamp).score);
    }
  }
}

console.log(`stamp groups probed: ${stampGroupsProbed}`);
console.log(
  `stamp same-marker pairs: ${stampSameMarkerPairs}, false evidence ${summary(stampSameMarkerEvidence)}`,
);
console.log(
  `stamp diff-marker pairs: ${stampDiffMarkerPairs}, no-evidence (null): ${stampDiffMarkerNull}`,
);
console.log(`stamp discriminative, correct side, 1px shift ${summary(stampCorrectMargin1)}`);
console.log(`stamp discriminative, correct side, 2px shift ${summary(stampCorrectMargin2)}`);
console.log(`stamp discriminative, wrong side, 1px shift   ${summary(stampWrongMargin1)}`);
console.log(`stamp whole-band floor, self 1px shift        ${summary(stampFloorSelf1)}`);
console.log(`stamp whole-band floor, wrong variant         ${summary(stampFloorWrong)}`);
