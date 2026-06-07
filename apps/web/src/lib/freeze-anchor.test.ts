import { afterEach, describe, expect, it } from "vitest";

import { createFrozenAnchor } from "./freeze-anchor";

// Distinct rect objects so we can assert which one is returned by identity,
// sidestepping DOMRect structural-equality quirks under jsdom.
function makeRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createFrozenAnchor", () => {
  it("exposes the element as contextElement for scroll tracking", () => {
    const element = document.createElement("div");
    document.body.append(element);

    expect(createFrozenAnchor(element).contextElement).toBe(element);
  });

  it("returns the live rect while the element stays connected", () => {
    const rectA = makeRect();
    const rectB = makeRect();
    let current = rectA;
    const element = document.createElement("div");
    element.getBoundingClientRect = () => current;
    document.body.append(element);

    const anchor = createFrozenAnchor(element);
    current = rectB;

    expect(anchor.getBoundingClientRect()).toBe(rectB);
  });

  it("freezes at the last connected rect once the element detaches", () => {
    const rectAtCreate = makeRect();
    const rectWhileLive = makeRect();
    const rectAfterDetach = makeRect();
    let current = rectAtCreate;
    const element = document.createElement("div");
    element.getBoundingClientRect = () => current;
    document.body.append(element);

    const anchor = createFrozenAnchor(element);
    // A reposition happens while still mounted, updating the cached rect.
    current = rectWhileLive;
    expect(anchor.getBoundingClientRect()).toBe(rectWhileLive);

    // The cell unmounts (last copy removed). Further reads must ignore the
    // detached element's (zeroed) rect and hold the last good one.
    element.remove();
    current = rectAfterDetach;
    expect(anchor.getBoundingClientRect()).toBe(rectWhileLive);
  });

  it("holds the creation-time rect when the element detaches before any live read", () => {
    const rectAtCreate = makeRect();
    const rectAfterDetach = makeRect();
    let current = rectAtCreate;
    const element = document.createElement("div");
    element.getBoundingClientRect = () => current;
    document.body.append(element);

    const anchor = createFrozenAnchor(element);
    element.remove();
    current = rectAfterDetach;

    expect(anchor.getBoundingClientRect()).toBe(rectAtCreate);
  });
});
