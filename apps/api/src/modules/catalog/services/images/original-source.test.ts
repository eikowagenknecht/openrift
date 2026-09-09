import { beforeEach, describe, expect, it } from "vitest";

import { mockFetch, mockIo, mockReadFile, resetImageMocks } from "../../../../test/image-mocks.js";
import { fetchOriginalImage } from "./original-source.js";

const UPLOAD_URL = "/media/submissions/0198f000-0000-7000-8000-00000000000a.png";

beforeEach(() => {
  resetImageMocks();
});

describe("fetchOriginalImage", () => {
  it("reads a submission upload off disk instead of over HTTP", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("on-disk"));

    const result = await fetchOriginalImage(mockIo, UPLOAD_URL);

    expect(result).toStrictEqual({ buffer: Buffer.from("on-disk"), ext: ".png" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("downloads anything else", async () => {
    const result = await fetchOriginalImage(mockIo, "https://example.com/card.png");

    expect(result.ext).toBe(".png");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});
