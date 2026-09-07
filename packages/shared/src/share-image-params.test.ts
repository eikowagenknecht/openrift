import { describe, expect, it } from "vitest";

import {
  aspectFromQuery,
  MAX_IMAGE_SCALE,
  qrFromQuery,
  scaleFromQuery,
  shareImageQueryParams,
} from "./share-image-params.js";

describe("shareImageQueryParams", () => {
  it("emits nothing for a render left entirely at its defaults", () => {
    expect(shareImageQueryParams()).toEqual({
      size: undefined,
      scale: undefined,
      aspect: undefined,
      qr: undefined,
    });
  });

  it("emits only the options that differ from their default", () => {
    expect(shareImageQueryParams({ aspect: "vertical", size: "hq", qr: false })).toEqual({
      size: "hq",
      scale: undefined,
      aspect: "vertical",
      qr: "0",
    });
  });

  it("omits landscape and an on qr, which are what the routes already do", () => {
    expect(shareImageQueryParams({ aspect: "landscape", qr: true })).toEqual({
      size: undefined,
      scale: undefined,
      aspect: undefined,
      qr: undefined,
    });
  });

  it("omits scale at 1x so the plain URL stays bare", () => {
    expect(shareImageQueryParams({ scale: 1 }).scale).toBeUndefined();
    expect(shareImageQueryParams({ scale: 3 }).scale).toBe("3");
  });
});

describe("aspectFromQuery", () => {
  it("reads back what the serializer wrote", () => {
    expect(aspectFromQuery(shareImageQueryParams({ aspect: "vertical" }).aspect)).toBe("vertical");
    expect(aspectFromQuery(shareImageQueryParams({ aspect: "landscape" }).aspect)).toBe(
      "landscape",
    );
  });

  it("falls back to landscape for anything unrecognised", () => {
    expect(aspectFromQuery(undefined)).toBe("landscape");
    expect(aspectFromQuery("square")).toBe("landscape");
  });
});

describe("scaleFromQuery", () => {
  it("uses an explicit scale within range", () => {
    expect(scaleFromQuery("1", undefined)).toBe(1);
    expect(scaleFromQuery("3", undefined)).toBe(3);
  });

  it("keeps size=hq meaning 2x so existing URLs render unchanged", () => {
    expect(scaleFromQuery(undefined, "hq")).toBe(2);
    expect(scaleFromQuery(undefined, undefined)).toBe(1);
  });

  it("lets an explicit scale win over size", () => {
    expect(scaleFromQuery("3", "hq")).toBe(3);
  });

  it("reads back what the serializer wrote", () => {
    const params = shareImageQueryParams({ scale: 3 });
    expect(scaleFromQuery(params.scale, params.size)).toBe(3);
    const legacy = shareImageQueryParams({ size: "hq" });
    expect(scaleFromQuery(legacy.scale, legacy.size)).toBe(2);
  });

  it("falls back rather than erroring on a scale it cannot use", () => {
    expect(scaleFromQuery(String(MAX_IMAGE_SCALE + 1), undefined)).toBe(1);
    expect(scaleFromQuery("0", undefined)).toBe(1);
    expect(scaleFromQuery("-2", undefined)).toBe(1);
    expect(scaleFromQuery("1.5", undefined)).toBe(1);
    expect(scaleFromQuery("huge", undefined)).toBe(1);
    expect(scaleFromQuery("", "hq")).toBe(2);
  });
});

describe("qrFromQuery", () => {
  it("draws the mark unless the request opted out", () => {
    expect(qrFromQuery(undefined)).toBe(true);
    expect(qrFromQuery("1")).toBe(true);
    expect(qrFromQuery("0")).toBe(false);
  });

  it("reads back what the serializer wrote", () => {
    expect(qrFromQuery(shareImageQueryParams({ qr: false }).qr)).toBe(false);
    expect(qrFromQuery(shareImageQueryParams({ qr: true }).qr)).toBe(true);
  });
});
