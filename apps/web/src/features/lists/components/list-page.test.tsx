import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EMPTY_TRADE_PREFERENCE, stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

const printingOnList = stubPrinting({ id: "printing-1", cardId: "card-1" });
const printingOffList = stubPrinting({ id: "printing-2", cardId: "card-1" });

const cardKindListDetail = {
  list: {
    id: "list-1",
    name: "My wishlist",
    kind: "card",
    intent: "wish",
    rules: [] as { id: string }[],
    tradeDefaults: EMPTY_TRADE_PREFERENCE,
    currency: null,
    shareToken: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  entries: [
    {
      id: "entry-1",
      kind: "card",
      cardId: "card-1",
      cardName: "Test Card",
      quantity: 1,
      tradeOverride: EMPTY_TRADE_PREFERENCE,
    },
  ],
};

const printingKindListDetail = {
  list: { ...cardKindListDetail.list, kind: "printing" },
  entries: [
    {
      id: "entry-1",
      kind: "printing",
      printingId: printingOnList.id,
      cardId: "card-1",
      cardName: "Test Card",
      quantity: 1,
      tradeOverride: EMPTY_TRADE_PREFERENCE,
    },
  ],
};

const ruleDrivenListDetail = {
  ...cardKindListDetail,
  list: { ...cardKindListDetail.list, rules: [{ id: "rule-1" }] },
};

const emptyListDetail = { ...cardKindListDetail, entries: [] };

const sharedListDetail = {
  ...cardKindListDetail,
  list: { ...cardKindListDetail.list, shareToken: "AbCdEfGhIjKl" },
};

const copyKindListDetail = {
  list: { ...cardKindListDetail.list, kind: "copy", intent: "organize" },
  entries: [
    {
      id: null,
      kind: "copy",
      copyId: "copy-1",
      printingId: printingOnList.id,
      cardId: "card-1",
      cardName: "Test Card",
      quantity: 1,
      source: "rule",
      ruleQuantity: 1,
      reserved: false,
      onLoan: false,
      tradeOverride: EMPTY_TRADE_PREFERENCE,
    },
  ],
};

let listDetail:
  | typeof cardKindListDetail
  | typeof printingKindListDetail
  | typeof copyKindListDetail
  | typeof sharedListDetail = cardKindListDetail;

function mutationStub() {
  return { mutate: vi.fn(), isPending: false, variables: undefined };
}

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      middleware: () => builder,
      handler: () => vi.fn(),
    };
    return builder;
  },
  createMiddleware: () => ({ server: () => ({}) }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: (props: { children?: unknown }) => <a href="#link">{props.children as never}</a>,
  createLink: (component: unknown) => component,
  useNavigate: () => vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: () => ({ data: undefined }),
  useSuspenseQuery: () => ({ data: undefined }),
  useMutation: () => mutationStub(),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/auth-session", () => ({
  useSession: () => ({ data: null }),
  useUserId: () => "user-1",
  useRequiredUserId: () => "user-1",
}));

vi.mock("@/features/lists/hooks/use-lists", () => ({
  useListDetail: () => ({ data: listDetail }),
  useLists: () => ({ data: [] }),
  useCreateList: () => mutationStub(),
  useDeleteList: () => mutationStub(),
  useRemoveListEntry: () => mutationStub(),
  useUpdateListEntry: () => mutationStub(),
  useUpdateList: () => mutationStub(),
  useMoveListEntries: () => mutationStub(),
  useBulkAddListEntries: () => mutationStub(),
  useBulkRemoveListEntries: () => mutationStub(),
}));

vi.mock("@/features/groups/hooks/use-friend-groups", () => ({
  useFriendGroupsList: () => ({ data: undefined }),
  useShareListWithFriendGroup: () => mutationStub(),
}));

vi.mock("@/features/cards/hooks/use-cards", () => ({
  useCards: () => ({
    allPrintings: [printingOnList, printingOffList],
    printingsById: {
      [printingOnList.id]: printingOnList,
      [printingOffList.id]: printingOffList,
    },
    printingsByCardId: new Map([["card-1", [printingOnList, printingOffList]]]),
    sets: [],
  }),
}));

let sortedCards: (typeof printingOnList)[] = [];

vi.mock("@/features/cards/hooks/use-card-data", () => ({
  useCardData: () => ({
    sortedCards,
    printingsByCardId: new Map([["card-1", [printingOnList]]]),
    priceRangeByCardId: undefined,
    availableFilters: {},
    availableLanguages: [],
    filterCounts: {},
    setDisplayLabel: () => "",
    totalUniqueCards: 0,
    filteredCount: 0,
  }),
}));

vi.mock("@/features/cards/hooks/use-card-filters", () => ({
  useFilterValues: () => ({
    filters: { ownedFilter: [] },
    sortBy: "name",
    sortDir: "asc",
    groupBy: "none",
    groupDir: "asc",
    hasActiveFilters: false,
  }),
  useFilterActions: () => ({ setSearch: vi.fn() }),
}));

const clearSelection = vi.fn();
const resetSelection = vi.fn();
const toggleSelectAll = vi.fn();
vi.mock("@/features/cards/hooks/use-card-selection", async () => {
  const { useGridSelectionStore: store } =
    await import("@/features/cards/stores/grid-selection-store");
  return {
    useCardSelection: () => ({
      selected: new Set<string>(),
      selectMode: store((s) => s.selectMode),
      setSelectMode: store((s) => s.setSelectMode),
      toggleSelect: vi.fn(),
      toggleSelectAll,
      clearSelection,
      resetSelection,
      getLastSelectedItemId: () => null,
      setLastSelectedItemId: vi.fn(),
      addToSelection: vi.fn(),
    }),
  };
});

vi.mock("@/features/collections/hooks/use-copies", () => ({
  useCopyListMemberships: () => ({ data: undefined, isLoading: false }),
  useDisposeCopies: () => mutationStub(),
  useMoveCopies: () => mutationStub(),
}));

vi.mock("@/features/collections/hooks/use-collections", () => ({
  useCollections: () => ({ data: [{ id: "col-1", name: "Bulk box", isInbox: false }] }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useChannelRegistry: () => new Map(),
}));

vi.mock("@/hooks/use-is-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/hooks/use-keyword-reverse-map", () => ({
  useKeywordReverseMap: () => new Map(),
}));

vi.mock("@/features/collections/hooks/use-owned-count", () => ({
  useOwnedCount: () => ({ data: undefined }),
}));

vi.mock("@/features/cards/hooks/use-card-thumbnail-display", () => ({
  useCardThumbnailDisplay: () => ({ favoriteMarketplace: null, prices: undefined }),
}));

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ toggleSidebar: vi.fn() }),
}));

vi.mock("@/features/cards/components/card-viewer", () => ({
  CardViewer: ({ rightPane }: { rightPane?: unknown }) => <div>{rightPane as never}</div>,
}));

vi.mock("@/features/cards/components/selection-detail-pane", () => ({
  SelectionDetailPane: ({ printingsByCardId }: { printingsByCardId: Map<string, unknown[]> }) => (
    <div>Detail pane printings: {printingsByCardId.get("card-1")?.length ?? 0}</div>
  ),
}));

vi.mock("@/features/cards/components/card-browser-filter-scaffold", () => ({
  CardBrowserFilterProvider: ({ children }: { children?: unknown }) => children as never,
  BrowserToolbar: () => null,
  BrowserLeftPane: () => null,
  BrowserActiveFilters: () => null,
}));

vi.mock("@/features/lists/components/list-header", () => ({
  ListHeader: ({ actions }: { actions?: unknown }) => <div>{actions as never}</div>,
}));

vi.mock("@/features/lists/components/list-visibility-menu-item", async () => {
  const { DropdownMenuItem } = await import("@/components/ui/dropdown-menu");
  return {
    ListVisibilityMenuItem: ({ onManageVisibility }: { onManageVisibility?: () => void }) => (
      <DropdownMenuItem onClick={onManageVisibility}>Group visibility</DropdownMenuItem>
    ),
  };
});

vi.mock("@/features/lists/components/list-group-visibility-dialog", () => ({
  ListGroupVisibilityDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Group visibility" /> : null,
}));

vi.mock("@/features/lists/components/list-edit-dialog", () => ({ ListEditDialog: () => null }));
vi.mock("@/features/lists/components/delete-list-dialog", () => ({ DeleteListDialog: () => null }));
vi.mock("@/features/lists/components/list-share-dialog", () => ({ ListShareDialog: () => null }));
vi.mock("@/features/lists/components/list-export-dialog", () => ({ ListExportDialog: () => null }));
vi.mock("@/features/lists/components/list-import-dialog", () => ({ ListImportDialog: () => null }));
vi.mock("@/features/lists/components/rule-editor-dialog", () => ({ RuleEditorDialog: () => null }));
vi.mock("@/features/groups/components/binder-sheet-dialog", () => ({
  BinderSheetDialog: () => null,
}));

const { ListPage } = await import("./list-page");
const { TopBarSlotContext } = await import("@/components/layout/top-bar-slot");
const { FilterSearchProvider } = await import("@/features/cards/lib/search-schemas");
const { useCardRowActionsStore } = await import("@/features/cards/stores/card-row-actions-store");
const { useGridFocusStore } = await import("@/features/cards/stores/grid-focus-store");
const { useGridSelectionStore } = await import("@/features/cards/stores/grid-selection-store");
const { useListEntriesStore } = await import("@/features/lists/stores/list-entries-store");
const { useSelectionStore } = await import("@/stores/selection-store");
const { useSiblingOverrideStore } = await import("@/features/cards/stores/sibling-override-store");

const resetters = [
  createStoreResetter(useCardRowActionsStore),
  createStoreResetter(useGridFocusStore),
  createStoreResetter(useGridSelectionStore),
  createStoreResetter(useListEntriesStore),
  createStoreResetter(useSelectionStore),
  createStoreResetter(useSiblingOverrideStore),
];

// The dropdown portals outside the render tree, and teardown wipes
// document.body before React unmounts, so an open menu must detach first.
async function closeOpenMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
}

function renderListPage() {
  const topBarSlot = document.createElement("div");
  document.body.append(topBarSlot);
  const view = render(
    <TopBarSlotContext value={topBarSlot}>
      <FilterSearchProvider value={{}}>
        <ListPage listId="list-1" />
      </FilterSearchProvider>
    </TopBarSlotContext>,
  );
  return { view, topBarSlot };
}

describe("ListPage", () => {
  afterEach(() => {
    for (const reset of resetters) {
      reset();
    }
    listDetail = cardKindListDetail;
    sortedCards = [];
    document.body.innerHTML = "";
  });

  it("opens the group-visibility dialog from the actions menu on a list with entries", async () => {
    const user = userEvent.setup();
    renderListPage();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "List actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Group visibility" }));
    expect(await screen.findByRole("dialog", { name: "Group visibility" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("offers Share from the top bar, not the actions menu", async () => {
    const user = userEvent.setup();
    renderListPage();

    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "List actions" }));
    expect(await screen.findByRole("menuitem", { name: "Export…" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Share" })).not.toBeInTheDocument();
    await closeOpenMenu(user);
  });

  it("offers the binder sheet once the list has a share link", async () => {
    listDetail = sharedListDetail;
    const user = userEvent.setup();
    renderListPage();

    await user.click(screen.getByRole("button", { name: "List actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "Print binder sheet…" }),
    ).toBeInTheDocument();
    await closeOpenMenu(user);
  });

  it("hides the binder sheet on a list with no share link to print", async () => {
    const user = userEvent.setup();
    renderListPage();

    await user.click(screen.getByRole("button", { name: "List actions" }));
    // Wait for the menu itself before asserting the absence, or the negative
    // would pass against a menu that simply hadn't opened yet.
    expect(await screen.findByRole("menuitem", { name: "Export…" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Print binder sheet…" })).not.toBeInTheDocument();
    await closeOpenMenu(user);
  });

  it("keeps the rule editor out of the top bar and offers it in the menu", async () => {
    const user = userEvent.setup();
    renderListPage();

    expect(screen.queryByRole("button", { name: /dynamic rules/iu })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "List actions" }));
    expect(await screen.findByRole("menuitem", { name: "Dynamic rules" })).toBeInTheDocument();
    await closeOpenMenu(user);
  });

  it("leads the empty state with the dynamic-rules pitch", () => {
    listDetail = emptyListDetail;
    renderListPage();

    expect(screen.getByRole("button", { name: "Set up dynamic rules" })).toBeInTheDocument();
    expect(screen.getByText(/a dynamic list fills itself/iu)).toBeInTheDocument();
  });

  it("offers to edit the rules instead when a dynamic list matches nothing", () => {
    listDetail = { ...ruleDrivenListDetail, entries: [] };
    renderListPage();

    expect(screen.getByRole("button", { name: "Edit dynamic rules" })).toBeInTheDocument();
    expect(screen.getByText(/nothing matches this list's rules yet/iu)).toBeInTheDocument();
  });

  it("offers 'Move all to collection' on a rule-driven copy list", async () => {
    listDetail = copyKindListDetail;
    const user = userEvent.setup();
    renderListPage();

    await user.click(screen.getByRole("button", { name: "List actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "Move all to collection" }),
    ).toBeInTheDocument();
    await closeOpenMenu(user);
  });

  it("hides 'Move all to collection' on a list with no copies behind it", async () => {
    const user = userEvent.setup();
    renderListPage();

    await user.click(screen.getByRole("button", { name: "List actions" }));
    // Wait for the menu itself before asserting the absence, or the negative
    // would pass against a menu that simply hadn't opened yet.
    expect(await screen.findByRole("menuitem", { name: "Export…" })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Move all to collection" }),
    ).not.toBeInTheDocument();
    await closeOpenMenu(user);
  });

  it("manages the selection from the top bar, like a collection does", async () => {
    sortedCards = [printingOnList];
    const user = userEvent.setup();
    renderListPage();

    expect(screen.getAllByRole("button", { name: "Manage cards" })[0]).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select all" })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Manage cards" })[0]!);

    expect(screen.getAllByRole("button", { name: "Done" })[0]).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage cards" })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Select all" })[0]!);
    expect(toggleSelectAll).toHaveBeenCalledWith(["entry-1"]);

    await user.click(screen.getAllByRole("button", { name: "Done" })[0]!);
    expect(screen.getAllByRole("button", { name: "Manage cards" })[0]).toBeInTheDocument();
  });

  it("hides the manage button on a list whose entries all came from a dynamic rule", () => {
    listDetail = copyKindListDetail;
    sortedCards = [printingOnList];
    renderListPage();

    expect(screen.queryByRole("button", { name: "Manage copies" })).not.toBeInTheDocument();
  });

  it("feeds the detail pane every catalog printing of a card on a printing-kind list", () => {
    listDetail = printingKindListDetail;
    renderListPage();

    expect(screen.getByText("Detail pane printings: 2")).toBeInTheDocument();
  });
});
