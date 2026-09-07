// oxlint-disable-next-line import/no-nodejs-modules -- test reads its sibling source file as text
import { readFileSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- test reads its sibling source file as text
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(import.meta.dirname, "./deck-print-dialog.tsx"), "utf-8");

// Modules that reach jsPDF (or the canvas rasteriser), ~100 KB compressed.
// This dialog mounts on every deck tile, so a value import puts that weight on the deck list's initial graph.
const PDF_BACKED_MODULES = [
  "@/lib/image-pdf",
  "@/lib/pdf-document",
  "@/lib/proxy-pdf",
  "@/features/tournaments/lib/registration-pdf",
  "@/features/collections/lib/binder-sheet-pdf",
  "jspdf",
  "html2canvas-pro",
];

// `import type` is erased before bundling and dynamic `import()` becomes its own chunk, so neither counts.
function staticValueImports(): string[] {
  const specifiers: string[] = [];
  const statements = /^import\s+(?<typeOnly>type\s+)?[\S\s]*?from\s+"(?<spec>[^"]+)";/gmu;
  let match = statements.exec(source);
  while (match !== null) {
    const { typeOnly, spec } = match.groups as { typeOnly?: string; spec: string };
    if (typeOnly === undefined) {
      specifiers.push(spec);
    }
    match = statements.exec(source);
  }
  return specifiers;
}

describe("deck-print-dialog load-time module graph", () => {
  it("imports no jsPDF-backed module at load time", () => {
    expect(staticValueImports().filter((spec) => PDF_BACKED_MODULES.includes(spec))).toEqual([]);
  });

  it("still reads the proxy and registration types it needs", () => {
    expect(source).toContain("import type { ProxyCard");
    expect(source).toContain('} from "@/features/tournaments/lib/registration-pdf";');
  });

  it("loads each generator through a module-scope dynamic import", () => {
    // Module scope, not the click handler: react-compiler bails on the whole
    // file when it meets an `import()` inside a component.
    expect(source).toMatch(
      /^async function loadImagePdfDownloader\(\) \{\n {2}const module = await import\("@\/lib\/image-pdf"\);/mu,
    );
    expect(source).toMatch(
      /^async function loadRegistrationPdfGenerator\(\) \{\n {2}const module = await import\("@\/features\/tournaments\/lib\/registration-pdf"\);/mu,
    );
    expect(source).toMatch(/await import\("@\/lib\/proxy-pdf"\)/u);
  });
});
