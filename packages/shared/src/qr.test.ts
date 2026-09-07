import QRCode from "qrcode";
import { describe, expect, it } from "vitest";

import { QR_MARGIN, qrMatrix, qrPngDataUri } from "./qr.js";

const SHARE_URL = "https://openrift.app/lists/share/AbCdEf123456";

function modulesAt(level: "L" | "M"): boolean[] {
  const { modules } = QRCode.create(SHARE_URL, { errorCorrectionLevel: level });
  return [...modules.data].map((bit) => bit === 1);
}

describe("qrMatrix", () => {
  it("returns a square matrix of at least the version-1 size", () => {
    const matrix = qrMatrix("https://openrift.app/decks/abc");
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    for (const row of matrix) {
      expect(row).toHaveLength(matrix.length);
    }
  });

  it("encodes the finder pattern in the top-left corner", () => {
    const matrix = qrMatrix("https://openrift.app");
    expect(matrix[0]?.slice(0, 7)).toEqual([true, true, true, true, true, true, true]);
    expect(matrix[1]?.slice(0, 7)).toEqual([true, false, false, false, false, false, true]);
  });

  it("encodes at error-correction level M rather than the library default", () => {
    const flattened = qrMatrix(SHARE_URL).flat();

    expect(flattened).toEqual(modulesAt("M"));
    expect(modulesAt("M")).not.toEqual(modulesAt("L"));
  });

  it("leaves the quiet zone to the renderer", () => {
    expect(QR_MARGIN).toBe(2);
    const matrix = qrMatrix(SHARE_URL);
    expect(matrix[0]?.[0]).toBe(true);
  });

  it("is deterministic for the same value", () => {
    expect(qrMatrix("https://openrift.app/x")).toEqual(qrMatrix("https://openrift.app/x"));
  });

  it("differs for different values", () => {
    expect(qrMatrix("https://openrift.app/x")).not.toEqual(qrMatrix("https://openrift.app/y"));
  });
});

describe("qrPngDataUri", () => {
  it("resolves to a PNG data URI", async () => {
    const uri = await qrPngDataUri("https://openrift.app/collections/share/token", { width: 256 });
    expect(uri.startsWith("data:image/png;base64,")).toBe(true);
    expect(uri.length).toBeGreaterThan("data:image/png;base64,".length);
  });

  it("produces different images for different values", async () => {
    const [one, two] = await Promise.all([
      qrPngDataUri("https://openrift.app/a", { width: 128 }),
      qrPngDataUri("https://openrift.app/b", { width: 128 }),
    ]);
    expect(one).not.toBe(two);
  });
});
