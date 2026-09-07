import { describe, expect, it, vi } from "vitest";

import type { BinderSheetOptions } from "./binder-sheet-pdf";
import { buildBinderSheetDoc } from "./binder-sheet-pdf";

// jsdom neither fetches nor decodes the logo SVG, and an unresolved image
// would hang the export; fail it immediately to exercise the no-logo path.
class UnloadableImage {
  src = "";
  addEventListener(event: string, callback: () => void) {
    if (event === "error") {
      globalThis.setTimeout(callback, 0);
    }
  }
}
vi.stubGlobal("Image", UnloadableImage);

const BASE: BinderSheetOptions = {
  shareUrl: "https://openrift.app/users/share/k3n8vq7m2p4x",
  title: "Summoner Kai",
  subtitle: "Scan to see my wish & tradelists",
  showLink: false,
  cutMarks: false,
  ruler: false,
  size: "card",
  paper: "a4",
  style: "light",
};

describe("buildBinderSheetDoc", () => {
  it("renders one A4 page", async () => {
    const doc = await buildBinderSheetDoc(BASE);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(297, 0);
  });

  it("renders Letter at Letter dimensions", async () => {
    const doc = await buildBinderSheetDoc({ ...BASE, paper: "letter", size: "3x3" });
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(215.9, 0);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(279.4, 0);
  });

  it("renders every size and style, with and without the optional lines", async () => {
    for (const size of ["card", "2x2", "3x3"] as const) {
      for (const style of ["light", "dark"] as const) {
        const doc = await buildBinderSheetDoc({
          ...BASE,
          size,
          style,
          showLink: true,
          contact: "Discord: summonerkai",
        });
        expect(doc.getNumberOfPages()).toBe(1);
        expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1000);
      }
    }
    // Six full PDF renders take ~4s alone and starve past the 5s default
    // when the whole suite runs in parallel.
  }, 20_000);

  it("survives a title far too long for the sheet", async () => {
    const doc = await buildBinderSheetDoc({ ...BASE, title: "Kai ".repeat(60) });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("still renders when the title and subtitle are blank", async () => {
    const doc = await buildBinderSheetDoc({ ...BASE, title: "", subtitle: "" });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("leaves out the cut marks and ruler unless they are asked for", async () => {
    const plain = await buildBinderSheetDoc({ ...BASE, size: "3x3" });
    const marked = await buildBinderSheetDoc({
      ...BASE,
      size: "3x3",
      cutMarks: true,
      ruler: true,
    });
    expect(plain.output("arraybuffer").byteLength).toBeLessThan(
      marked.output("arraybuffer").byteLength,
    );
  });

  it("draws marks for both the 9-up grid and a single sheet", async () => {
    for (const size of ["card", "3x3"] as const) {
      const plain = await buildBinderSheetDoc({ ...BASE, size });
      const marked = await buildBinderSheetDoc({ ...BASE, size, cutMarks: true });
      expect(plain.output("arraybuffer").byteLength).toBeLessThan(
        marked.output("arraybuffer").byteLength,
      );
    }
    // Four renders; same suite-load headroom as the size-and-style loop above.
  }, 20_000);
});
