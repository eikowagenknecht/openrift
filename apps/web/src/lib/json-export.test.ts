import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadJSON, downloadJSONText } from "./json-export";

const createObjectURL = vi.fn<(blob: Blob) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();

/** The anchors handed out by the stubbed `createElement`, newest last. */
let anchors: HTMLAnchorElement[] = [];
/** Every blob `createObjectURL` was handed, newest last. */
let blobs: Blob[] = [];

beforeEach(() => {
  anchors = [];
  blobs = [];
  createObjectURL.mockReset();
  revokeObjectURL.mockReset();
  createObjectURL.mockImplementation((blob) => {
    blobs.push(blob);
    return `blob:openrift/${blobs.length}`;
  });
  // jsdom implements neither, and a real click would try to navigate.
  vi.stubGlobal("URL", Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL }));

  // Bound now so it captures the original, before the spy below replaces it.
  // oxlint-disable-next-line typescript/no-deprecated -- a bare method reference resolves to the deprecated legacy-tag overload
  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const element = realCreateElement(tag);
    if (tag === "a") {
      const anchor = element as HTMLAnchorElement;
      vi.spyOn(anchor, "click").mockImplementation(() => {});
      anchors.push(anchor);
    }
    return element;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("downloadJSONText", () => {
  it("downloads the text verbatim under the given filename", async () => {
    downloadJSONText('{"a":1}', "cards-export-2026-08-15.json");

    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toBe("cards-export-2026-08-15.json");
    expect(anchors[0].click).toHaveBeenCalledOnce();
    expect(blobs[0].type).toBe("application/json");
    // Verbatim: no reformatting of what the server already serialized.
    await expect(blobs[0].text()).resolves.toBe('{"a":1}');
  });

  it("releases the object URL it created", () => {
    downloadJSONText("{}", "empty.json");

    expect(revokeObjectURL).toHaveBeenCalledWith(createObjectURL.mock.results[0].value);
  });

  it("downloads empty text rather than skipping the download", async () => {
    downloadJSONText("", "empty.json");

    expect(anchors[0].click).toHaveBeenCalledOnce();
    await expect(blobs[0].text()).resolves.toBe("");
  });
});

describe("downloadJSON", () => {
  it("serializes the value pretty-printed", async () => {
    downloadJSON({ name: "Summoner Skirmish", rounds: [1, 2] }, "event.json");

    await expect(blobs[0].text()).resolves.toBe(
      '{\n  "name": "Summoner Skirmish",\n  "rounds": [\n    1,\n    2\n  ]\n}',
    );
    expect(anchors[0].download).toBe("event.json");
  });

  it("handles an empty array", async () => {
    downloadJSON([], "none.json");

    await expect(blobs[0].text()).resolves.toBe("[]");
  });
});
