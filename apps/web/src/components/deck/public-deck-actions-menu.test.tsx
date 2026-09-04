import type { CardType, PublicDeckCardResponse } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ShareImageRenderChoice } from "@/components/share/share-image-panel";

const { encodeMock, copyMock, toastMock, dialogProps } = vi.hoisted(() => ({
  encodeMock: vi.fn(),
  copyMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  dialogProps: {} as Record<string, Record<string, unknown>>,
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/hooks/use-decks", () => ({
  useEncodeDeckCards: () => ({ mutateAsync: encodeMock, isPending: false }),
}));

vi.mock("@/hooks/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => ({ copied: false, copy: copyMock, reset: vi.fn() }),
}));

vi.mock("@/lib/site-config", () => ({ getSiteUrl: () => "https://openrift.app" }));

vi.mock("@/components/layout/page-top-bar", () => ({
  PageTopBarIconButton: (props: Record<string, unknown>) => (
    <button type="button" data-in-top-bar {...props} />
  ),
}));

vi.mock("@/components/share/share-dialog", () => ({
  ShareDialog: (props: Record<string, unknown>) => {
    dialogProps.share = props;
    return null;
  },
}));

vi.mock("@/components/deck/deck-print-dialog", () => ({
  DeckPrintDialog: (props: Record<string, unknown>) => {
    dialogProps.print = props;
    return null;
  },
}));

vi.mock("@/components/deck/deck-export-dialog", () => ({
  DeckExportDialog: (props: Record<string, unknown>) => {
    dialogProps.export = props;
    return null;
  },
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { PublicDeckActionsMenu } from "./public-deck-actions-menu";

function publicCard(overrides: Partial<PublicDeckCardResponse> = {}): PublicDeckCardResponse {
  return {
    cardId: "card-1",
    zone: "main",
    quantity: 3,
    preferredPrintingId: null,
    cardName: "Yasuo",
    cardSlug: "yasuo",
    cardType: "unit" as CardType,
    cardTypes: ["unit" as CardType],
    superTypes: [],
    domains: [],
    tags: [],
    keywords: [],
    maxCopiesOverride: null,
    banned: false,
    energy: 2,
    might: 3,
    power: 1,
    resolvedPrintingId: null,
    shortCode: null,
    imageId: null,
    ...overrides,
  };
}

function renderMenu(props: Partial<React.ComponentProps<typeof PublicDeckActionsMenu>> = {}) {
  return render(
    <PublicDeckActionsMenu
      deckId="deck-1"
      deckName="Yasuo Aggro"
      shareToken="tok123"
      updatedAt="2026-09-01T00:00:00.000Z"
      cards={[publicCard()]}
      {...props}
    />,
  );
}

async function openMenu(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Deck actions" }));
  await screen.findByRole("menuitem", { name: "Copy deck code" });
  return user;
}

const IMAGE_VERSION = new Date("2026-09-01T00:00:00.000Z").getTime();

describe("PublicDeckActionsMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    encodeMock.mockResolvedValue({ code: "DECKCODE", warnings: [] });
    copyMock.mockResolvedValue(true);
  });

  it("offers the four public actions and nothing that needs an account", async () => {
    renderMenu();
    await openMenu();

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Copy deck code",
      "Save image…",
      "Print…",
      "Export…",
    ]);
    expect(screen.queryByText(/share link/iu)).toBeNull();
    expect(screen.queryByText(/delete/iu)).toBeNull();
  });

  it("encodes the deck's own cards and copies the code back", async () => {
    renderMenu();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Copy deck code" }));

    expect(encodeMock).toHaveBeenCalledWith({
      cards: [expect.objectContaining({ cardId: "card-1", quantity: 3, zone: "main" })],
    });
    expect(copyMock).toHaveBeenCalledWith("DECKCODE");
    expect(toastMock.success).toHaveBeenCalledWith("Deck code copied");
  });

  it("says so when the clipboard write is denied", async () => {
    copyMock.mockResolvedValue(false);
    renderMenu();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Copy deck code" }));

    expect(toastMock.error).toHaveBeenCalledWith("Couldn't copy the deck code");
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("warns when the encoder left cards out", async () => {
    encodeMock.mockResolvedValue({ code: "DECKCODE", warnings: ["Skipped Yasuo."] });
    renderMenu();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Copy deck code" }));

    expect(toastMock.warning).toHaveBeenCalledWith("The deck code left some cards out.", {
      description: "Skipped Yasuo.",
    });
  });

  it("stays quiet when the encoder rejects, which the global handler reports", async () => {
    encodeMock.mockRejectedValue(new Error("nope"));
    renderMenu();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Copy deck code" }));

    expect(copyMock).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("builds the image download off the share token, not an owner route", () => {
    renderMenu();

    const image = dialogProps.share?.image as {
      buildUrl: (choice: ShareImageRenderChoice) => string;
      qr: string;
    };
    expect(image.qr).toBe("available");
    expect(image.buildUrl({ aspect: "vertical", scale: 2, qr: false })).toBe(
      `https://openrift.app/api/v1/decks/share/tok123/image.png?v=${IMAGE_VERSION}&size=hq&aspect=vertical&qr=0`,
    );
    expect(image.buildUrl({ aspect: "landscape", scale: 1, qr: true })).toBe(
      `https://openrift.app/api/v1/decks/share/tok123/image.png?v=${IMAGE_VERSION}`,
    );
  });

  it("hands the print and export dialogs the public source and the deck's cards", () => {
    renderMenu();

    const source = { shareToken: "tok123", imageVersion: IMAGE_VERSION };
    expect(dialogProps.print?.publicSource).toEqual(source);
    expect(dialogProps.export?.publicSource).toEqual(source);
    expect(dialogProps.export?.isDirty).toBe(false);
    expect(dialogProps.print?.cards).toEqual([
      expect.objectContaining({ cardId: "card-1", quantity: 3 }),
    ]);
  });

  it("renders the trigger as a top-bar button when the page has a bar", async () => {
    renderMenu({ inTopBar: true });

    expect(screen.getByRole("button", { name: "Deck actions" })).toHaveAttribute("data-in-top-bar");
    await openMenu();
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
  });
});
