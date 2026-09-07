import { describe, expect, it } from "vitest";

import { scanAssetError } from "./scan-asset-hint";

describe("scanAssetError", () => {
  it("carries the asset name, the url and the repair", () => {
    const message = scanAssetError("the scan bank", "/media/scan/scan-bank-abc.bin");

    expect(message).toContain("the scan bank");
    expect(message).toContain("/media/scan/scan-bank-abc.bin");
    expect(message).toContain("/admin/scan");
  });

  it("never names the removed dev export script", () => {
    for (const url of [
      "/media/scan/scan-encoder-v2.onnx",
      "/media/scan/scan-opencv-v1.js",
      "https://openrift.app/media/scan/scan-labels-abc.json",
      "",
    ]) {
      expect(scanAssetError("an asset", url)).not.toContain("export-index");
    }
  });
});
