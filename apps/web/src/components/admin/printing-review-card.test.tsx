import type {
  AdminPrintingImageResponse,
  AdminPrintingResponse,
  CandidatePrintingResponse,
  ProviderSettingResponse,
} from "@openrift/shared";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeduplicatedSourceImage } from "@/components/admin/card-detail-shared";
import { useAdminCardFoldStore } from "@/stores/admin-card-fold-store";
import { createStoreResetter } from "@/test/store-helpers";

const captured = vi.hoisted(() => ({
  spreadsheet: null as { candidateRows?: unknown[] } | null,
  switcher: null as {
    images?: AdminPrintingImageResponse[];
    sourceImages?: DeduplicatedSourceImage[];
  } | null,
  checkAll: vi.fn(),
  deletePrinting: vi.fn(),
}));

vi.mock("@/components/admin/candidate-spreadsheet", () => ({
  CandidateSpreadsheet: (props: { candidateRows?: unknown[] }) => {
    captured.spreadsheet = props;
    return null;
  },
}));

vi.mock("@/components/admin/printing-image-switcher", () => ({
  PrintingImageSwitcher: (props: {
    images?: AdminPrintingImageResponse[];
    sourceImages?: DeduplicatedSourceImage[];
  }) => {
    captured.switcher = props;
    return null;
  },
}));

vi.mock("@/components/admin/printing-marketplace-cells", () => ({
  PrintingMarketplaceBadges: () => null,
}));

vi.mock("@tanstack/react-router", () => ({ Link: () => null }));

// The row pulls nine mutations; stub them all so it renders without a QueryClient.
const stubMutation = { mutate: vi.fn(), isPending: false };
vi.mock("@/hooks/use-admin-card-mutations", () => ({
  useAcceptPrintingField: () => stubMutation,
  useCheckAllCandidatePrintings: () => ({ mutate: captured.checkAll, isPending: false }),
  useCheckCandidatePrinting: () => stubMutation,
  useCopyCandidatePrinting: () => stubMutation,
  useDeleteCandidatePrinting: () => stubMutation,
  useDeletePrinting: () => ({ mutate: captured.deletePrinting, isPending: false }),
  useLinkCandidatePrintings: () => stubMutation,
  useUncheckCandidatePrinting: () => stubMutation,
}));

vi.mock("@/hooks/use-ignored-candidates", () => ({
  useIgnoreCandidatePrinting: () => stubMutation,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { PrintingReviewCard } from "./printing-review-card";

const CARD_ID = "yasuo";

function stubPrinting(overrides: Partial<AdminPrintingResponse> = {}): AdminPrintingResponse {
  return {
    id: "p1",
    expectedPrintingId: "OGN-001::foil",
    setSlug: "ogn",
    language: "EN",
    markerSlugs: [],
    ...overrides,
  } as AdminPrintingResponse;
}

function stubSource(overrides: Partial<CandidatePrintingResponse> = {}): CandidatePrintingResponse {
  return {
    id: "cp1",
    printingId: "p1",
    candidateCardId: "cc1",
    externalId: "x1",
    finish: "foil",
    imageUrl: null,
    checkedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as CandidatePrintingResponse;
}

function stubImage(
  overrides: Partial<AdminPrintingImageResponse> = {},
): AdminPrintingImageResponse {
  return {
    id: "img1",
    printingId: "p1",
    originalUrl: "https://cdn.test/a.png",
    isActive: true,
    ...overrides,
  } as AdminPrintingImageResponse;
}

function renderCard(
  props: Partial<React.ComponentProps<typeof PrintingReviewCard>> = {},
): ReturnType<typeof render> {
  const printing = props.printing ?? stubPrinting();
  return render(
    <PrintingReviewCard
      printing={printing}
      cardId={CARD_ID}
      printings={[printing]}
      candidatePrintings={[]}
      printingImages={[]}
      marketplaceMappings={[]}
      sourceLabels={{}}
      sourceNames={{}}
      providerSettings={[]}
      printingSourceFields={[]}
      setTotals={{}}
      costKeywords={[]}
      invalidates={[]}
      isAdmin
      {...props}
    />,
  );
}

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useAdminCardFoldStore);
  captured.spreadsheet = null;
  captured.switcher = null;
  captured.checkAll.mockReset();
  captured.deletePrinting.mockReset();
});

afterEach(() => {
  resetStore();
});

describe("PrintingReviewCard", () => {
  it("shows the printing label and its own source count", () => {
    const { getByText } = renderCard({
      candidatePrintings: [
        stubSource({ id: "cp1" }),
        stubSource({ id: "cp2" }),
        // Belongs to a sibling printing and must not be counted here.
        stubSource({ id: "cp3", printingId: "p2" }),
      ],
    });

    expect(getByText("OGN-001::foil")).toBeTruthy();
    expect(getByText("(2 sources)")).toBeTruthy();
  });

  it("uses the singular source label for one source", () => {
    const { getByText } = renderCard({ candidatePrintings: [stubSource()] });

    expect(getByText("(1 source)")).toBeTruthy();
  });

  it("passes only its own sources and images down", () => {
    renderCard({
      candidatePrintings: [stubSource({ id: "cp1" }), stubSource({ id: "cp3", printingId: "p2" })],
      printingImages: [stubImage({ id: "img1" }), stubImage({ id: "img2", printingId: "p2" })],
    });

    expect(captured.spreadsheet?.candidateRows).toHaveLength(1);
    expect(captured.switcher?.images?.map((i) => i.id)).toEqual(["img1"]);
  });

  it("warns when the printing has no active image", () => {
    const { getByText } = renderCard({ printingImages: [stubImage({ isActive: false })] });

    expect(getByText("no image")).toBeTruthy();
  });

  it("drops the warning once an image is active", () => {
    const { queryByText } = renderCard({ printingImages: [stubImage()] });

    expect(queryByText("no image")).toBeNull();
  });

  // Offering an image the printing already accepted would let an admin re-add
  // the same file, so accepted URLs drop out of the switcher's source list.
  it("offers source images that are not already accepted", () => {
    renderCard({
      candidatePrintings: [
        stubSource({ id: "cp1", imageUrl: "https://cdn.test/a.png" }),
        stubSource({ id: "cp2", imageUrl: "https://cdn.test/b.png" }),
      ],
      printingImages: [stubImage({ originalUrl: "https://cdn.test/a.png" })],
    });

    expect(captured.switcher?.sourceImages?.map((i) => i.url)).toEqual(["https://cdn.test/b.png"]);
  });

  it("renders the body only while expanded, and folds on a header click", () => {
    const { getByText } = renderCard();
    expect(captured.spreadsheet).not.toBeNull();

    captured.spreadsheet = null;
    getByText("OGN-001::foil").click();

    expect(useAdminCardFoldStore.getState().collapsedByCard[CARD_ID]?.has("p1")).toBe(true);
    expect(captured.spreadsheet).toBeNull();
  });

  it("starts collapsed when the store already has the printing folded", () => {
    useAdminCardFoldStore.getState().togglePrinting(CARD_ID, "p1");
    renderCard();

    expect(captured.spreadsheet).toBeNull();
  });

  it("offers a check-all button counting only the unchecked sources", () => {
    const { getByText } = renderCard({
      candidatePrintings: [
        stubSource({ id: "cp1", checkedAt: null }),
        stubSource({ id: "cp2", checkedAt: null }),
        stubSource({ id: "cp3" }),
      ],
    });

    getByText("Check 2 unchecked").click();
    expect(captured.checkAll).toHaveBeenCalledWith({ printingId: "p1" });
  });

  it("hides the check-all button once every source is checked", () => {
    const { queryByText } = renderCard({ candidatePrintings: [stubSource()] });

    expect(queryByText(/unchecked/u)).toBeNull();
  });

  // Triage and delete stay full-admin; a card-review grant holder only accepts
  // fields, so neither the check-all button nor the overflow menu renders.
  it("hides the triage actions from non-admins", () => {
    const { queryByText } = renderCard({
      isAdmin: false,
      candidatePrintings: [stubSource({ checkedAt: null })],
    });

    expect(queryByText(/unchecked/u)).toBeNull();
    expect(captured.spreadsheet).not.toBeNull();
  });

  it("marks a printing whose favorited source disagrees as a mismatch", () => {
    const providerSettings = [
      { provider: "piltover", isFavorite: true, sortOrder: 0 },
    ] as unknown as ProviderSettingResponse[];
    const printingSourceFields = [{ key: "artist", label: "Artist" }] as never[];

    const { container } = renderCard({
      printing: stubPrinting({ artist: "Riot" }),
      candidatePrintings: [stubSource({ artist: "Someone Else" } as never)],
      sourceLabels: { cc1: "piltover" },
      providerSettings,
      printingSourceFields,
    });

    expect(container.querySelector(".bg-yellow-50")).toBeTruthy();
    expect(container.querySelector(".bg-green-50")).toBeNull();
  });

  it("marks a printing whose favorited source agrees as a match", () => {
    const providerSettings = [
      { provider: "piltover", isFavorite: true, sortOrder: 0 },
    ] as unknown as ProviderSettingResponse[];
    const printingSourceFields = [{ key: "artist", label: "Artist" }] as never[];

    const { container } = renderCard({
      printing: stubPrinting({ artist: "Riot" }),
      candidatePrintings: [stubSource({ artist: "Riot" } as never)],
      sourceLabels: { cc1: "piltover" },
      providerSettings,
      printingSourceFields,
    });

    expect(container.querySelector(".bg-green-50")).toBeTruthy();
  });
});
