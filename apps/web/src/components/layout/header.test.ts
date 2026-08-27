import { describe, expect, it } from "vitest";

import { signInRedirectFor, visibleMoreSections } from "./header";

const flagsOn = { glossary: true, meta: true };
const flagsOff = { glossary: false, meta: false };

describe("visibleMoreSections", () => {
  it("puts the Stage and tier lists under Create on desktop", () => {
    const create = visibleMoreSections({ flags: flagsOn, mobile: false }).find(
      (s) => s.label === "Create",
    );
    expect(create?.items.map((i) => i.to)).toEqual(["/stage", "/tier-lists"]);
  });

  it("drops the Create section entirely in the mobile sheet", () => {
    const labels = visibleMoreSections({ flags: flagsOn, mobile: true }).map((s) => s.label);
    expect(labels).not.toContain("Create");
  });

  it("keeps the other sections in both menus", () => {
    const desktop = visibleMoreSections({ flags: flagsOn, mobile: false }).map((s) => s.label);
    const mobile = visibleMoreSections({ flags: flagsOn, mobile: true }).map((s) => s.label);
    expect(desktop).toEqual(["Play", "Organize", "Create", "Explore"]);
    expect(mobile).toEqual(["Play", "Organize", "Explore"]);
  });

  it("hides a flagged item while its flag is off", () => {
    const play = visibleMoreSections({ flags: flagsOff, mobile: false }).find(
      (s) => s.label === "Play",
    );
    expect(play?.items.map((i) => i.to)).not.toContain("/glossary");
  });

  it("splits Scan by platform", () => {
    const organize = (mobile: boolean) =>
      visibleMoreSections({ flags: flagsOn, mobile })
        .find((s) => s.label === "Organize")
        ?.items.map((i) => i.to);
    expect(organize(false)).toContain("/scan");
    expect(organize(true)).not.toContain("/scan");
  });
});

describe("signInRedirectFor", () => {
  it("returns to the page the user was on, search included", () => {
    expect(signInRedirectFor({ pathname: "/cards", href: "/cards?q=vi" })).toBe("/cards?q=vi");
  });

  it("carries no redirect from the marketing page", () => {
    expect(signInRedirectFor({ pathname: "/", href: "/" })).toBeUndefined();
  });

  it("carries no redirect from an auth page", () => {
    expect(signInRedirectFor({ pathname: "/login", href: "/login" })).toBeUndefined();
    expect(signInRedirectFor({ pathname: "/signup", href: "/signup?email=a" })).toBeUndefined();
    expect(signInRedirectFor({ pathname: "/verify-email", href: "/verify-email" })).toBeUndefined();
    expect(
      signInRedirectFor({ pathname: "/reset-password", href: "/reset-password" }),
    ).toBeUndefined();
  });

  it("keeps a nested path under an excluded prefix", () => {
    expect(signInRedirectFor({ pathname: "/decks/abc", href: "/decks/abc" })).toBe("/decks/abc");
  });
});
