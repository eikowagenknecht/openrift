import type { Printing } from "@openrift/shared";
import { normalizeNameForMatching } from "@openrift/shared";
import type { Worker } from "tesseract.js";
import { createWorker } from "tesseract.js";

interface OcrMatch {
  printing: Printing;
  confidence: number;
  rawText: string;
  matchedOn: "name" | "shortCode" | "publicCode";
}

export interface OcrResult {
  rawText: string;
  elapsed: number;
  matches: OcrMatch[];
}

let worker: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = await createWorker("eng");
  }
  return worker;
}

export async function terminateOcr(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

/**
 * Run OCR on a canvas/image and match against a list of printings.
 *
 * @returns OCR result with raw text, timing, and ranked matches.
 */
export async function ocrScan(
  image: HTMLCanvasElement | HTMLImageElement | Blob,
  printings: Printing[],
): Promise<OcrResult> {
  const start = performance.now();
  const w = await getWorker();

  const source = image instanceof Blob ? URL.createObjectURL(image) : image;
  const { data } = await w.recognize(source);
  if (typeof source === "string" && image instanceof Blob) {
    URL.revokeObjectURL(source);
  }

  const rawText = data.text.trim();
  const elapsed = Math.round(performance.now() - start);

  const matches = matchOcrText(rawText, printings);
  return { rawText, elapsed, matches };
}

function matchOcrText(rawText: string, printings: Printing[]): OcrMatch[] {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const scored: OcrMatch[] = [];

  for (const printing of printings) {
    let best: OcrMatch | null = null;

    // Try matching publicCode exactly (e.g. "OGN-027")
    for (const line of lines) {
      if (printing.publicCode && line.toUpperCase().includes(printing.publicCode.toUpperCase())) {
        const match: OcrMatch = {
          printing,
          confidence: 0.95,
          rawText,
          matchedOn: "publicCode",
        };
        if (!best || match.confidence > best.confidence) {
          best = match;
        }
      }
    }

    // Try matching short code with set code (e.g. "OGN 027" or "OGN-027")
    for (const line of lines) {
      // Extract numeric part from short code (e.g. "OGN-027" → "027")
      const codeMatch = printing.shortCode.match(/^[A-Z]{3}-(.+)$/);
      if (codeMatch) {
        const numPart = codeMatch[1];
        const setPattern = `${printing.setSlug}[\\s\\-#]*0*${numPart}`;
        const regex = new RegExp(setPattern, "i");
        if (regex.test(line)) {
          const match: OcrMatch = {
            printing,
            confidence: 0.9,
            rawText,
            matchedOn: "shortCode",
          };
          if (!best || match.confidence > best.confidence) {
            best = match;
          }
        }
      }
    }

    // Try fuzzy name matching (check both card name and printed name)
    const namesToCheck = [printing.card.name];
    if (printing.printedName && printing.printedName !== printing.card.name) {
      namesToCheck.push(printing.printedName);
    }
    for (const nameToMatch of namesToCheck) {
      const normalizedCardName = normalizeNameForMatching(nameToMatch);
      for (const line of lines) {
        const normalizedLine = normalizeNameForMatching(line);
        if (normalizedLine.length < 3) {
          continue;
        }

        if (normalizedLine === normalizedCardName) {
          const match: OcrMatch = {
            printing,
            confidence: 0.85,
            rawText,
            matchedOn: "name",
          };
          if (!best || match.confidence > best.confidence) {
            best = match;
          }
        } else if (
          normalizedCardName.includes(normalizedLine) ||
          normalizedLine.includes(normalizedCardName)
        ) {
          const shorter = Math.min(normalizedLine.length, normalizedCardName.length);
          const longer = Math.max(normalizedLine.length, normalizedCardName.length);
          const ratio = shorter / longer;
          if (ratio > 0.5) {
            const confidence = 0.4 + ratio * 0.4;
            const match: OcrMatch = {
              printing,
              confidence,
              rawText,
              matchedOn: "name",
            };
            if (!best || match.confidence > best.confidence) {
              best = match;
            }
          }
        }
      }
    }

    if (best) {
      scored.push(best);
    }
  }

  // Sort by confidence descending, take top 10
  scored.sort((a, b) => b.confidence - a.confidence);
  return scored.slice(0, 10);
}
