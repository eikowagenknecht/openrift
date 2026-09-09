import { describe, expect, it } from "vitest";

import { uploadImageErrorMessage } from "./submission-upload-error";

describe("uploadImageErrorMessage", () => {
  it("names the size limit on 413", () => {
    expect(uploadImageErrorMessage(413)).toContain("20 MB");
  });

  it("says the file was not an image on 400", () => {
    expect(uploadImageErrorMessage(400)).toContain("not an image");
  });

  it("points at tomorrow on 429", () => {
    expect(uploadImageErrorMessage(429)).toContain("tomorrow");
  });

  it("falls back to a retry message on any other status", () => {
    expect(uploadImageErrorMessage(500)).toBe(
      "The upload did not go through. Try again in a moment.",
    );
    expect(uploadImageErrorMessage(401)).toBe(
      "The upload did not go through. Try again in a moment.",
    );
  });
});
