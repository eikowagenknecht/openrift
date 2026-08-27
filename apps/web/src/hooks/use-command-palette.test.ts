import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useCommandPaletteShortcuts, useRegisterQuickAdd } from "@/hooks/use-command-palette";
import { useCommandPaletteStore } from "@/stores/command-palette-store";
import { createStoreResetter } from "@/test/store-helpers";

const resetStore = createStoreResetter(useCommandPaletteStore);

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  resetStore();
});

const store = () => useCommandPaletteStore.getState();

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
}

describe("useCommandPaletteShortcuts", () => {
  it("opens the palette on Ctrl+K", () => {
    renderHook(() => useCommandPaletteShortcuts());
    press("k", { ctrlKey: true });
    expect(store().open).toBe(true);
  });

  it("opens the palette on Cmd+K", () => {
    renderHook(() => useCommandPaletteShortcuts());
    press("k", { metaKey: true });
    expect(store().open).toBe(true);
  });

  it("ignores a bare k, so typing into the page is unaffected", () => {
    renderHook(() => useCommandPaletteShortcuts());
    press("k");
    expect(store().open).toBe(false);
  });

  it("ignores an auto-repeat, so a held chord does not flicker the dialog", () => {
    renderHook(() => useCommandPaletteShortcuts());
    press("k", { ctrlKey: true, repeat: true });
    expect(store().open).toBe(false);
  });

  it("opens the palette on a bare slash", () => {
    renderHook(() => useCommandPaletteShortcuts());
    press("/");
    expect(store().open).toBe(true);
  });

  it("leaves slash alone inside a text field", () => {
    renderHook(() => useCommandPaletteShortcuts());
    const input = document.createElement("input");
    document.body.append(input);
    press("/", {}, input);
    expect(store().open).toBe(false);
    input.remove();
  });

  it("leaves slash alone when a modifier is held, so Ctrl+/ stays the browser's", () => {
    renderHook(() => useCommandPaletteShortcuts());
    press("/", { ctrlKey: true });
    expect(store().open).toBe(false);
  });

  it("stops listening once unmounted", () => {
    const { unmount } = renderHook(() => useCommandPaletteShortcuts());
    unmount();
    press("k", { ctrlKey: true });
    expect(store().open).toBe(false);
  });
});

describe("useRegisterQuickAdd", () => {
  it("registers while mounted and clears on unmount", () => {
    const { unmount } = renderHook(() =>
      useRegisterQuickAdd({ key: "collection:a", label: "Add to Binder" }),
    );
    expect(store().quickAdd).toEqual({
      key: "collection:a",
      label: "Add to Binder",
      moveLabel: null,
      claimsShortcut: true,
    });
    unmount();
    expect(store().quickAdd).toBeNull();
  });

  it("registers nothing for a null key, which is the signed-out catalog", () => {
    renderHook(() => useRegisterQuickAdd({ key: null, label: "Add to Inbox" }));
    expect(store().quickAdd).toBeNull();
  });

  it("records a quick-add that leaves Ctrl+K to the global palette", () => {
    renderHook(() =>
      useRegisterQuickAdd({ key: "catalog:inbox", label: "Add to Inbox", claimsShortcut: false }),
    );
    expect(store().quickAdd?.claimsShortcut).toBe(false);
  });

  it("follows a label change, so renaming a collection renames the row", () => {
    const { rerender } = renderHook(
      ({ label }: { label: string }) => useRegisterQuickAdd({ key: "collection:a", label }),
      { initialProps: { label: "Add to Binder" } },
    );
    rerender({ label: "Add to Shoebox" });
    expect(store().quickAdd?.label).toBe("Add to Shoebox");
  });
});
