import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { stubCopy, stubPrinting } from "@/test/factories";

const yasuo = stubPrinting({ id: "p-yasuo", cardId: "card-yasuo", card: { name: "Yasuo" } });
const jinx = stubPrinting({ id: "p-jinx", cardId: "card-jinx", card: { name: "Jinx" } });

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "user-1",
}));

vi.mock("@/features/cards/hooks/use-cards", () => ({
  useCards: () => ({
    allPrintings: [yasuo, jinx],
    printingsById: { [yasuo.id]: yasuo, [jinx.id]: jinx },
    sets: [],
  }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    labels: { rarities: {}, conditions: {}, graders: {} },
  }),
}));

let queryResult: { data: { id: string; printingId: string }[] | undefined; isLoading: boolean } = {
  data: [],
  isLoading: false,
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => queryResult,
}));

vi.mock("@/features/collections/lib/copies-query", () => ({
  copiesQueryOptions: (_userId: string, collectionId?: string) => ({ collectionId }),
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => toastSuccess(...args) } }));

const { CollectionExportDialog } = await import("./collection-export-dialog");

function setup(overrides: { collectionId?: string; collectionName?: string } = {}) {
  render(
    <CollectionExportDialog
      collectionId={overrides.collectionId}
      collectionName={overrides.collectionName ?? "Main binder"}
      open
      onOpenChange={vi.fn()}
    />,
  );
}

describe("CollectionExportDialog", () => {
  beforeEach(() => {
    queryResult = { data: [], isLoading: false };
    toastSuccess.mockReset();
    vi.stubGlobal(
      "URL",
      Object.assign(globalThis.URL, {
        createObjectURL: vi.fn(() => "blob:fake"),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  it("shows the title and disables Export while loading", () => {
    queryResult = { data: undefined, isLoading: true };
    setup();

    expect(screen.getByRole("heading", { name: "Export collection" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Loading..." })).toBeDisabled();
  });

  it("disables Export when the collection has no copies", () => {
    queryResult = { data: [], isLoading: false };
    setup();

    expect(screen.getByRole("button", { name: /export/iu })).toBeDisabled();
  });

  it("enables Export and shows the copy count once copies load", () => {
    queryResult = { data: [stubCopy({ printingId: yasuo.id })], isLoading: false };
    setup();

    expect(screen.getByRole("button", { name: "Export 1 copy" })).toBeEnabled();
  });

  it("downloads a CSV and toasts on Export", async () => {
    const user = userEvent.setup();
    queryResult = { data: [stubCopy({ printingId: yasuo.id })], isLoading: false };
    setup();

    await user.click(screen.getByRole("button", { name: "Export 1 copy" }));

    expect(toastSuccess).toHaveBeenCalledWith("Collection exported.");
  });

  it("aggregates Cardmarket wants by card name", () => {
    queryResult = {
      data: [
        stubCopy({ printingId: yasuo.id }),
        stubCopy({ printingId: yasuo.id }),
        stubCopy({ printingId: jinx.id }),
      ],
      isLoading: false,
    };
    setup();

    const wants = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(wants.value).toBe("1x Jinx\n2x Yasuo");
  });

  it("skips copies whose printing is missing from the catalog when building wants", () => {
    queryResult = { data: [stubCopy({ printingId: "unknown" })], isLoading: false };
    setup();

    expect(screen.queryByText("Cardmarket wants")).not.toBeInTheDocument();
  });
});
