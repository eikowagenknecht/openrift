import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const html2canvas = vi.fn();

vi.mock("html2canvas-pro", () => ({ html2canvas }));

const { CARD_EXPORT_WIDTH, exportCardImage, waitForRender } = await import("./card-export");

const PNG = new Blob(["png"], { type: "image/png" });

function fakeCanvas(blob: Blob | null): {
  toBlob: (callback: (blob: Blob | null) => void) => void;
} {
  return {
    toBlob: (callback) => {
      callback(blob);
    },
  };
}

function cardElement(width = 300, height = 420): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "offsetWidth", { value: width, configurable: true });
  Object.defineProperty(element, "offsetHeight", { value: height, configurable: true });
  return element;
}

function stubClipboard(write: (items: unknown[]) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", {
    value: { write },
    configurable: true,
  });
  vi.stubGlobal(
    "ClipboardItem",
    class {
      readonly items: Record<string, Blob>;
      constructor(items: Record<string, Blob>) {
        this.items = items;
      }
    },
  );
}

function removeClipboard(): void {
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
}

let clicked: { href: string; download: string }[] = [];
let revoked: string[] = [];

beforeEach(() => {
  html2canvas.mockReset();
  html2canvas.mockResolvedValue(fakeCanvas(PNG));
  clicked = [];
  revoked = [];
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:card",
    revokeObjectURL: (url: string) => revoked.push(url),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function recordClick(this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    },
  );
  removeClipboard();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  removeClipboard();
});

describe("waitForRender", () => {
  it("resolves once the browser has painted", async () => {
    await expect(waitForRender()).resolves.toBeUndefined();
  });
});

describe("exportCardImage", () => {
  it("captures the element at its own size and twice its density", async () => {
    await exportCardImage(cardElement(), "download", "card.png");
    expect(html2canvas).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 300, height: 420, scale: 2, backgroundColor: null }),
    );
  });

  it("downloads the png under the given filename", async () => {
    const outcome = await exportCardImage(cardElement(), "download", "jinx.png");
    expect(outcome).toBe("downloaded");
    expect(clicked).toEqual([{ href: "blob:card", download: "jinx.png" }]);
  });

  it("releases the object url after the download", async () => {
    await exportCardImage(cardElement(), "download", "jinx.png");
    expect(revoked).toEqual(["blob:card"]);
  });

  it("leaves no anchor behind in the document", async () => {
    await exportCardImage(cardElement(), "download", "jinx.png");
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });

  it("writes a png to the clipboard when asked to copy", async () => {
    const write = vi.fn<(items: unknown[]) => Promise<void>>().mockResolvedValue();
    stubClipboard(write);
    const outcome = await exportCardImage(cardElement(), "copy", "jinx.png");
    expect(outcome).toBe("copied");
    expect(write).toHaveBeenCalledOnce();
    expect(clicked).toEqual([]);
  });

  it("downloads instead when the browser has no clipboard image support", async () => {
    const outcome = await exportCardImage(cardElement(), "copy", "jinx.png");
    expect(outcome).toBe("downloaded");
    expect(clicked).toHaveLength(1);
  });

  it("downloads instead when the clipboard write is refused", async () => {
    const write = vi
      .fn<(items: unknown[]) => Promise<void>>()
      .mockRejectedValue(new Error("denied"));
    stubClipboard(write);
    const outcome = await exportCardImage(cardElement(), "copy", "jinx.png");
    expect(outcome).toBe("downloaded");
    expect(clicked).toHaveLength(1);
  });

  it("never downloads a copy that already reached the clipboard", async () => {
    const write = vi.fn<(items: unknown[]) => Promise<void>>().mockResolvedValue();
    stubClipboard(write);
    await exportCardImage(cardElement(), "copy", "jinx.png");
    expect(revoked).toEqual([]);
  });

  it("reports a failed rasterization instead of downloading nothing", async () => {
    html2canvas.mockResolvedValue(fakeCanvas(null));
    await expect(exportCardImage(cardElement(), "download", "jinx.png")).rejects.toThrow(
      "Failed to rasterize the card.",
    );
    expect(clicked).toEqual([]);
  });

  it("waits for the fonts before capturing", async () => {
    const order: string[] = [];
    Object.defineProperty(document, "fonts", {
      value: { ready: Promise.resolve().then(() => order.push("fonts")) },
      configurable: true,
    });
    html2canvas.mockImplementation(() => {
      order.push("capture");
      return Promise.resolve(fakeCanvas(PNG));
    });
    await exportCardImage(cardElement(), "download", "jinx.png");
    expect(order).toEqual(["fonts", "capture"]);
  });

  it("captures a card that carries nested children", async () => {
    const element = cardElement();
    element.append(document.createElement("span"));
    await expect(exportCardImage(element, "download", "jinx.png")).resolves.toBe("downloaded");
  });
});

describe("CARD_EXPORT_WIDTH", () => {
  it("is the render width the designer lays the card out at", () => {
    expect(CARD_EXPORT_WIDTH).toBe(750);
  });
});
