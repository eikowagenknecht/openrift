import { describe, expect, it } from "vitest";

import { isTempCopyId, TEMP_COPY_ID_PREFIX } from "./temp-copy-id";

describe("isTempCopyId", () => {
  it("recognizes an optimistic copy id", () => {
    expect(isTempCopyId(`${TEMP_COPY_ID_PREFIX}1`)).toBe(true);
  });

  it("rejects a server-assigned uuid", () => {
    expect(isTempCopyId("00000000-0000-0000-0000-000000000001")).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(isTempCopyId("")).toBe(false);
  });

  it("rejects an id that only contains the prefix later on", () => {
    expect(isTempCopyId("copy-temp-1")).toBe(false);
  });
});
