import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePageTocStore } from "@/stores/page-toc-store";
import { createStoreResetter } from "@/test/store-helpers";

import { PageTocMobileTrigger } from "./page-toc";

const ITEMS = [
  { id: "rule-100", label: "100. Game Concepts", level: 0 },
  { id: "rule-100-1", label: "100.1 Players", level: 1 },
  { id: "rule-200", label: "200. Parts of a Card", level: 0 },
];

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(usePageTocStore);
  for (const item of ITEMS) {
    const heading = document.createElement("div");
    heading.id = item.id;
    document.body.append(heading);
  }
});

afterEach(() => {
  resetStore();
  for (const item of ITEMS) {
    document.querySelector(`#${item.id}`)?.remove();
  }
});

describe("PageTocMobileTrigger", () => {
  it("renders nothing when items is empty", () => {
    const { container } = render(<PageTocMobileTrigger items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens the drawer and shows all items", async () => {
    const user = userEvent.setup();
    render(<PageTocMobileTrigger items={ITEMS} />);

    await user.click(screen.getByRole("button", { name: "Open contents" }));

    for (const item of ITEMS) {
      expect(screen.getByRole("link", { name: item.label })).toBeInTheDocument();
    }
  });

  it("scrolls to target, updates active id, and closes the drawer on item click", async () => {
    const user = userEvent.setup();
    const scrollSpy = vi
      .spyOn(globalThis.Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    render(<PageTocMobileTrigger items={ITEMS} />);

    await user.click(screen.getByRole("button", { name: "Open contents" }));
    await user.click(screen.getByRole("link", { name: "100.1 Players" }));

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(usePageTocStore.getState().activeId).toBe("rule-100-1");
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "100.1 Players" })).not.toBeInTheDocument();
    });

    scrollSpy.mockRestore();
  });

  it("highlights the active item driven by the store", async () => {
    const user = userEvent.setup();
    usePageTocStore.getState().setActiveId("rule-200");
    render(<PageTocMobileTrigger items={ITEMS} />);

    await user.click(screen.getByRole("button", { name: "Open contents" }));

    const activeLink = screen.getByRole("link", { name: "200. Parts of a Card" });
    expect(activeLink.className).toContain("text-foreground");
    expect(activeLink.className).toContain("font-medium");
  });
});
