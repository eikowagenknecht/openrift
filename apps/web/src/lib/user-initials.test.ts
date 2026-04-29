import { describe, expect, it } from "vitest";

import { getUserInitials } from "./user-initials";

describe("getUserInitials", () => {
  it("uses the first letters of the first two name parts", () => {
    expect(getUserInitials("Ada Lovelace", undefined)).toBe("AL");
    expect(getUserInitials("ada lovelace", undefined)).toBe("AL");
  });

  it("limits to two initials when the name has more parts", () => {
    expect(getUserInitials("Mary Ann Evans", undefined)).toBe("MA");
  });

  it("uses a single initial for a single-word name", () => {
    expect(getUserInitials("Cher", undefined)).toBe("C");
  });

  it("falls back to email and splits on the @ sign", () => {
    expect(getUserInitials(undefined, "first.last@example.com")).toBe("FE");
    expect(getUserInitials(undefined, "alice@example.com")).toBe("AE");
  });

  it("prefers name over email when both are present", () => {
    expect(getUserInitials("Ada Lovelace", "z@example.com")).toBe("AL");
  });

  it("returns ? when neither name nor email is available", () => {
    expect(getUserInitials(undefined, undefined)).toBe("?");
  });
});
