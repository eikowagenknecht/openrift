import { describe, expect, test } from "vitest";

import { tagProcedure, taggedProcedure } from "./orpc-procedure-tag";

describe("orpc procedure tag", () => {
  test("round-trips a nested procedure path", () => {
    const error = new Error("Internal server error");
    tagProcedure(error, ["meta", "events"]);

    expect(taggedProcedure(error)).toBe("meta.events");
  });

  test("does not enumerate onto the error", () => {
    const error = new Error("Internal server error");
    tagProcedure(error, ["cards"]);

    expect(Object.keys(error)).toEqual([]);
  });

  test("ignores a thrown string", () => {
    tagProcedure("boom", ["cards"]);

    expect(taggedProcedure("boom")).toBeUndefined();
  });

  test("ignores null", () => {
    expect(taggedProcedure(null)).toBeUndefined();
  });

  test("reads nothing off an untagged error", () => {
    expect(taggedProcedure(new Error("boom"))).toBeUndefined();
  });

  test("refuses a non-string tag someone else set", () => {
    const error = Object.assign(new Error("boom"), { orpcProcedure: 42 });

    expect(taggedProcedure(error)).toBeUndefined();
  });
});
