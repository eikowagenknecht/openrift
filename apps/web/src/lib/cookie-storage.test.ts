import { afterEach, describe, expect, it } from "vitest";

import { cookieStorage } from "./cookie-storage";

// cookieStorage wraps a raw cookie StateStorage with zustand's
// createJSONStorage, so getItem/setItem operate on the parsed
// StorageValue object, not the raw cookie string.

function clearCookies() {
  for (const row of document.cookie.split("; ")) {
    const name = row.split("=")[0];
    if (name) {
      document.cookie = `${name}=; path=/; max-age=0`;
    }
  }
}

describe("cookieStorage", () => {
  afterEach(() => {
    clearCookies();
  });

  it("round-trips a state object through set/get", async () => {
    await cookieStorage!.setItem("pref", { state: { value: 1 }, version: 0 });

    expect(await cookieStorage!.getItem("pref")).toEqual({ state: { value: 1 }, version: 0 });
  });

  it("returns null for a cookie that was never set", async () => {
    expect(await cookieStorage!.getItem("missing")).toBeNull();
  });

  it("URL-encodes the cookie name", async () => {
    await cookieStorage!.setItem("pref name", { state: { value: "x" }, version: 0 });

    expect(document.cookie).toContain(`${encodeURIComponent("pref name")}=`);
    expect(await cookieStorage!.getItem("pref name")).toEqual({
      state: { value: "x" },
      version: 0,
    });
  });

  it("removes a cookie", async () => {
    await cookieStorage!.setItem("pref", { state: { value: "x" }, version: 0 });
    expect(await cookieStorage!.getItem("pref")).not.toBeNull();

    await cookieStorage!.removeItem("pref");

    expect(await cookieStorage!.getItem("pref")).toBeNull();
  });

  it("does not confuse cookies with matching name prefixes", async () => {
    await cookieStorage!.setItem("pref", { state: { value: "short" }, version: 0 });
    await cookieStorage!.setItem("pref-extra", { state: { value: "long" }, version: 0 });

    expect(await cookieStorage!.getItem("pref")).toEqual({ state: { value: "short" }, version: 0 });
    expect(await cookieStorage!.getItem("pref-extra")).toEqual({
      state: { value: "long" },
      version: 0,
    });
  });

  it("preserves an '=' character inside the stored value", async () => {
    await cookieStorage!.setItem("pref", { state: { value: "a=b=c" }, version: 0 });

    expect(await cookieStorage!.getItem("pref")).toEqual({ state: { value: "a=b=c" }, version: 0 });
  });
});
