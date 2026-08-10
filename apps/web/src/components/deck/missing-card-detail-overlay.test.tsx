import type { Printing } from "@openrift/shared";
import type * as ReactRouter from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CSSProperties, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { stubPrinting } from "@/test/factories";

vi.mock("@/hooks/use-domain-colors", () => ({
  useDomainColors: () => ({}),
}));

vi.mock("@/hooks/use-apply-tag-filter", () => ({
  useApplyTagFilter: () => null,
}));

// The overlay's history entry goes through the router (see
// use-overlay-history-entry), which has no provider in a bare render. The stub
// applies the entry to jsdom's history the way the real router would, so the
// close and back-button assertions below still exercise the real thing.
const routerStub = {
  navigate: vi.fn(({ state }: { state: (prev: object) => object }) => {
    history.pushState(state(history.state ?? {}), "");
  }),
  latestLocation: { href: "/decks/deck-1" },
};
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useRouter: () => routerStub,
}));

const isMobile = vi.fn(() => false);
vi.mock("@/hooks/use-is-mobile", () => ({
  useIsMobile: () => isMobile(),
}));

const catalog = { printingsById: {} as Record<string, Printing>, printingsByCardId: new Map() };
vi.mock("@/hooks/use-cards", () => ({
  useCards: () => catalog,
}));

// BaseUI portals and traps focus; pass-through stubs keep the test on the
// overlay's own wiring (open gating, prev/next range, history entry).
vi.mock("@/components/ui/dialog", () => ({
  // The real dismiss runs through BaseUI's dialog context, which the stub does
  // not carry; this button stands in for it so the tests exercise the
  // overlay's own onOpenChange handler rather than the stub.
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: ReactNode;
  }) =>
    open === false ? null : (
      <div>
        <button type="button" onClick={() => onOpenChange?.(false)}>
          dismiss
        </button>
        {children}
      </div>
    ),
  // Spreads the rest so the overlay's onKeyDown reaches the DOM.
  DialogContent: ({
    children,
    ...props
  }: { children?: ReactNode; style?: CSSProperties } & Record<string, unknown>) => (
    <div {...props}>{children}</div>
  ),
  DialogDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogClose: ({
    children,
    render: _render,
    ...props
  }: { children?: ReactNode; render?: ReactNode } & Record<string, unknown>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
    open === false ? null : <div>{children}</div>,
  DrawerContent: ({ children }: { children?: ReactNode; style?: CSSProperties }) => (
    <div>{children}</div>
  ),
  DrawerDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

// The real CardDetail is lazy-loaded and heavy; the stub surfaces the id of the
// card it was handed plus the nav label, which is what these tests assert on.
vi.mock("@/components/cards/card-detail", () => ({
  CardDetail: ({ printing, navLabel }: { printing: Printing; navLabel?: string }) => (
    <div>
      <div>showing {printing.id}</div>
      {navLabel ? <div>{navLabel}</div> : null}
    </div>
  ),
}));

const { MissingCardDetailOverlay } = await import("./missing-card-detail-overlay");

function seedCatalog(count: number): Printing[] {
  const printings = Array.from({ length: count }, (_, i) => stubPrinting({ id: `printing-${i}` }));
  catalog.printingsById = Object.fromEntries(printings.map((p) => [p.id, p]));
  catalog.printingsByCardId = new Map(printings.map((p) => [p.cardId, [p]]));
  return printings;
}

function renderOverlay(
  printings: Printing[],
  openPrintingId: string | null,
  onOpenPrintingIdChange = vi.fn(),
) {
  const result = render(
    <MissingCardDetailOverlay
      printingIds={printings.map((p) => p.id)}
      openPrintingId={openPrintingId}
      onOpenPrintingIdChange={onOpenPrintingIdChange}
      showImages={false}
      onSearchAndClose={() => {}}
    />,
  );
  return { ...result, onOpenPrintingIdChange };
}

beforeEach(() => {
  isMobile.mockReturnValue(false);
});

describe("MissingCardDetailOverlay", () => {
  it("renders nothing while no row is open", () => {
    const printings = seedCatalog(3);
    renderOverlay(printings, null);

    expect(screen.queryByText(/showing/u)).not.toBeInTheDocument();
  });

  it("shows the card for the opened row", async () => {
    const printings = seedCatalog(3);
    renderOverlay(printings, printings[1].id);

    expect(await screen.findByText(`showing ${printings[1].id}`)).toBeInTheDocument();
  });

  it("renders the drawer on phones and the dialog on desktop", async () => {
    const printings = seedCatalog(2);
    isMobile.mockReturnValue(true);
    renderOverlay(printings, printings[0].id);

    // The drawer has no nav label (the pane layout has no room for it), which
    // is how the two arrangements are told apart here.
    expect(await screen.findByText(`showing ${printings[0].id}`)).toBeInTheDocument();
    expect(screen.queryByText("1 / 2")).not.toBeInTheDocument();
  });

  it("counts position against the missing list, not the whole catalog", async () => {
    // The catalog holds five printings; only three are missing rows.
    const printings = seedCatalog(5);
    renderOverlay(printings.slice(0, 3), printings[1].id);

    expect(await screen.findByText("2 / 3")).toBeInTheDocument();
  });

  it("steps through the missing rows with the arrow keys", async () => {
    const printings = seedCatalog(3);
    const { onOpenPrintingIdChange } = renderOverlay(printings, printings[1].id);
    const inside = await screen.findByText(`showing ${printings[1].id}`);

    fireEvent.keyDown(inside, { key: "ArrowRight" });

    expect(onOpenPrintingIdChange).toHaveBeenCalledWith(printings[2].id);
  });

  it("stays put at the ends of the list", async () => {
    const printings = seedCatalog(3);
    const { onOpenPrintingIdChange } = renderOverlay(printings, printings[0].id);
    const inside = await screen.findByText(`showing ${printings[0].id}`);

    fireEvent.keyDown(inside, { key: "ArrowLeft" });

    expect(onOpenPrintingIdChange).not.toHaveBeenCalled();
  });

  it("returns to the missing list when closed", async () => {
    const user = userEvent.setup();
    const printings = seedCatalog(2);
    // Closing unwinds its own history entry rather than calling the parent
    // straight away, so the entry can't outlive the overlay and swallow the
    // next back press. jsdom does not traverse session history, so the popstate
    // that carries the close in the browser is asserted separately below.
    const back = vi.spyOn(history, "back");
    renderOverlay(printings, printings[0].id);

    await user.click(await screen.findByRole("button", { name: "dismiss" }));

    expect(back).toHaveBeenCalled();
    back.mockRestore();
  });

  it("closes on a browser back navigation", async () => {
    const printings = seedCatalog(2);
    const { onOpenPrintingIdChange } = renderOverlay(printings, printings[0].id);
    await screen.findByText(`showing ${printings[0].id}`);

    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    expect(onOpenPrintingIdChange).toHaveBeenCalledWith(null);
  });

  it("pushes one history entry per open, however often the parent re-renders", async () => {
    const printings = seedCatalog(2);
    const pushState = vi.spyOn(history, "pushState");
    const { rerender } = renderOverlay(printings, printings[0].id);
    await screen.findByText(`showing ${printings[0].id}`);
    const afterOpen = pushState.mock.calls.length;
    // Guards the assertion below from passing on a count that never moved.
    expect(afterOpen).toBeGreaterThan(0);

    // A fresh callback identity each render is the normal case for an inline
    // arrow at the call site. Pushing an entry per render would leave the back
    // button needing as many presses as the overlay had rendered.
    for (let i = 0; i < 3; i++) {
      rerender(
        <MissingCardDetailOverlay
          printingIds={printings.map((p) => p.id)}
          openPrintingId={printings[0].id}
          onOpenPrintingIdChange={() => {}}
          showImages={false}
          onSearchAndClose={() => {}}
        />,
      );
    }

    expect(pushState.mock.calls.length).toBe(afterOpen);
    pushState.mockRestore();
  });
});
