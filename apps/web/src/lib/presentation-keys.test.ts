import { describe, expect, it } from "vitest";

import {
  BOARD_ACTIONS,
  isTypingTarget,
  ownsSpaceKey,
  resolvePresentationKey,
  WALK_ACTIONS,
} from "./presentation-keys";

describe("resolvePresentationKey", () => {
  it.each([
    ["ArrowRight", "next"],
    ["ArrowDown", "next"],
    ["PageDown", "next"],
    [" ", "next"],
    ["ArrowLeft", "prev"],
    ["ArrowUp", "prev"],
    ["PageUp", "prev"],
    ["Home", "first"],
    ["End", "last"],
    ["t", "toggleText"],
    ["T", "toggleText"],
    ["f", "toggleStrip"],
    ["F", "toggleStrip"],
    ["b", "toggleBoard"],
    ["B", "toggleBoard"],
    ["c", "toggleHero"],
    ["C", "toggleHero"],
    ["k", "toggleRank"],
    ["K", "toggleRank"],
    ["r", "toggleReveal"],
    ["R", "toggleReveal"],
    ["d", "toggleDirection"],
    ["D", "toggleDirection"],
    ["o", "toggleObs"],
    ["O", "toggleObs"],
    ["e", "toggleEdit"],
    ["E", "toggleEdit"],
    ["p", "push"],
    ["P", "push"],
    ["h", "toggleHidden"],
    ["H", "toggleHidden"],
    ["?", "toggleHelp"],
    ["Escape", "exit"],
  ])("maps %s to %s", (key, expected) => {
    expect(resolvePresentationKey({ key })).toBe(expected);
  });

  it("ignores keys it doesn't own", () => {
    expect(resolvePresentationKey({ key: "q" })).toBeNull();
    expect(resolvePresentationKey({ key: "Enter" })).toBeNull();
  });

  it.each(["ctrlKey", "metaKey", "altKey"] as const)(
    "leaves %s presses to the browser",
    (modifier) => {
      expect(resolvePresentationKey({ key: "ArrowLeft", [modifier]: true })).toBeNull();
      expect(resolvePresentationKey({ key: "f", [modifier]: true })).toBeNull();
    },
  );
});

describe("BOARD_ACTIONS", () => {
  it("holds exactly the actions a run without a board should leave alone", () => {
    expect([...BOARD_ACTIONS].toSorted()).toEqual([
      "toggleBoard",
      "toggleDirection",
      "toggleHero",
      "toggleObs",
      "toggleRank",
      "toggleReveal",
    ]);
  });

  it("does not claim an action every run answers to", () => {
    expect(BOARD_ACTIONS.has("next")).toBe(false);
    expect(BOARD_ACTIONS.has("toggleText")).toBe(false);
    expect(BOARD_ACTIONS.has("exit")).toBe(false);
  });

  it("leaves the OBS push out, since a board run can push too", () => {
    expect(BOARD_ACTIONS.has("push")).toBe(false);
  });
});

describe("WALK_ACTIONS", () => {
  it("holds exactly the actions that need a running order", () => {
    expect([...WALK_ACTIONS].toSorted()).toEqual([
      "first",
      "last",
      "next",
      "prev",
      "push",
      "toggleBoard",
      "toggleDirection",
      "toggleHero",
      "toggleObs",
      "toggleRank",
      "toggleReveal",
      "toggleStrip",
      "toggleText",
    ]);
  });

  // The four the editor keeps. Adding one of these to WALK_ACTIONS would leave
  // a creator ranking on camera with no way to see the keys, get back to the
  // show, leave the stage, or take the stale board off the stream.
  it.each(["toggleHelp", "toggleEdit", "toggleHidden", "exit"] as const)(
    "keeps %s alive while editing",
    (action) => {
      expect(WALK_ACTIONS.has(action)).toBe(false);
    },
  );

  it("subsumes every board action, since a board layer only dresses the walk", () => {
    for (const action of BOARD_ACTIONS) {
      expect(WALK_ACTIONS.has(action)).toBe(true);
    }
  });
});

describe("isTypingTarget", () => {
  it("is true for text inputs", () => {
    const input = document.createElement("input");
    expect(isTypingTarget(input)).toBe(true);
  });

  it("is true for textareas and selects", () => {
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
  });

  it("is true for contenteditable regions", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isTypingTarget(div)).toBe(true);
  });

  it("is false for ordinary elements and for null", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("ownsSpaceKey", () => {
  it("is true for a button, so Space still activates it", () => {
    expect(ownsSpaceKey(document.createElement("button"))).toBe(true);
  });

  it("is true for a link and for role=button", () => {
    expect(ownsSpaceKey(document.createElement("a"))).toBe(true);
    const div = document.createElement("div");
    div.setAttribute("role", "button");
    expect(ownsSpaceKey(div)).toBe(true);
  });

  it("is true for an element nested inside a button — the icon inside it", () => {
    const button = document.createElement("button");
    const icon = document.createElement("span");
    button.append(icon);
    expect(ownsSpaceKey(icon)).toBe(true);
  });

  it("is false for ordinary content and for null", () => {
    expect(ownsSpaceKey(document.createElement("div"))).toBe(false);
    expect(ownsSpaceKey(null)).toBe(false);
  });
});
