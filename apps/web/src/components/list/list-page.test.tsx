import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EMPTY_TRADE_PREFERENCE } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

// A card-kind wish list with one entry, so ListPage renders the non-empty
// branch (the card browser). Regression: the group-visibility dialog used to
// be mounted only in the empty-state branch, so the top-bar people icon did
// nothing on any list that had cards (see the `visibilityDialog` node in both
// return branches of ListPage).
const listDetail = {
  list: {
    id: "list-1",
    name: "My wishlist",
    kind: "card",
    intent: "wish",
    rules: [],
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

vi.mock("@/hooks/use-lists", () => ({
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

vi.mock("@/hooks/use-friend-groups", () => ({
  useFriendGroupsList: () => ({ data: undefined }),
  useShareListWithFriendGroup: () => mutationStub(),
}));

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({
    allPrintings: [],
    printingsById: {},
    printingsByCardId: new Map(),
    sets: [],
  }),
}));

vi.mock("@/hooks/use-card-data", () => ({
  useCardData: () => ({
    sortedCards: [],
    printingsByCardId: new Map(),
    priceRangeByCardId: undefined,
    availableFilters: {},
    availableLanguages: [],
    filterCounts: {},
    setDisplayLabel: () => "",
    totalUniqueCards: 0,
    filteredCount: 0,
  }),
}));

vi.mock("@/hooks/use-card-filters", () => ({
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
vi.mock("@/hooks/use-card-selection", () => ({
  useCardSelection: () => ({
    selected: new Set<string>(),
    toggleSelect: vi.fn(),
    clearSelection,
    getLastSelectedItemId: () => null,
    setLastSelectedItemId: vi.fn(),
    addToSelection: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-copies", () => ({
  useCopyListMemberships: () => ({ data: undefined, isLoading: false }),
  useDisposeCopies: () => mutationStub(),
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

vi.mock("@/hooks/use-owned-count", () => ({
  useOwnedCount: () => ({ data: undefined }),
}));

vi.mock("@/components/cards/card-thumbnail", async (importOriginal) => ({
  ...(await importOriginal()),
  useCardThumbnailDisplay: () => ({ favoriteMarketplace: null, prices: undefined }),
}));

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ toggleSidebar: vi.fn() }),
}));

vi.mock("@/components/card-viewer", () => ({
  CardViewer: () => null,
}));

vi.mock("@/components/cards/card-browser-filter-scaffold", () => ({
  CardBrowserFilterProvider: ({ children }: { children?: unknown }) => children as never,
  BrowserToolbar: () => null,
  BrowserLeftPane: () => null,
  BrowserActiveFilters: () => null,
}));

// The header just needs to host the actions cluster so the visibility button
// is clickable; its real layout is irrelevant here.
vi.mock("@/components/list/list-header", () => ({
  ListHeader: ({ actions }: { actions?: unknown }) => <div>{actions as never}</div>,
}));

vi.mock("@/components/list/list-visibility-button", () => ({
  ListVisibilityButton: ({ onManageVisibility }: { onManageVisibility?: () => void }) => (
    <button type="button" onClick={onManageVisibility}>
      Group visibility
    </button>
  ),
}));

// The dialog's own behavior is covered by list-group-visibility-dialog.test.tsx;
// here we only care that ListPage mounts it and wires `open` up.
vi.mock("@/components/list/list-group-visibility-dialog", () => ({
  ListGroupVisibilityDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Group visibility" /> : null,
}));

vi.mock("@/components/list/list-edit-dialog", () => ({ ListEditDialog: () => null }));
vi.mock("@/components/list/delete-list-dialog", () => ({ DeleteListDialog: () => null }));
vi.mock("@/components/list/list-share-dialog", () => ({ ListShareDialog: () => null }));
vi.mock("@/components/list/list-export-dialog", () => ({ ListExportDialog: () => null }));
vi.mock("@/components/list/list-import-dialog", () => ({ ListImportDialog: () => null }));
vi.mock("@/components/list/rule-editor-dialog", () => ({ RuleEditorDialog: () => null }));

vi.mock("@/routes/_app/_authenticated/collections/route", async () => {
  const { createContext } = await import("react");
  return { TopBarSlotContext: createContext<HTMLElement | null>(null) };
});

const { ListPage } = await import("./list-page");
const { TopBarSlotContext } = await import("@/routes/_app/_authenticated/collections/route");
const { FilterSearchProvider } = await import("@/lib/search-schemas");
const { useCardRowActionsStore } = await import("@/stores/card-row-actions-store");
const { useGridFocusStore } = await import("@/stores/grid-focus-store");
const { useListEntriesStore } = await import("@/stores/list-entries-store");
const { useSelectionStore } = await import("@/stores/selection-store");
const { useSiblingOverrideStore } = await import("@/stores/sibling-override-store");

const resetters = [
  createStoreResetter(useCardRowActionsStore),
  createStoreResetter(useGridFocusStore),
  createStoreResetter(useListEntriesStore),
  createStoreResetter(useSelectionStore),
  createStoreResetter(useSiblingOverrideStore),
];

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
    document.body.innerHTML = "";
  });

  it("opens the group-visibility dialog from the top-bar people icon on a list with entries", async () => {
    const user = userEvent.setup();
    renderListPage();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Group visibility" }));
    expect(screen.getByRole("dialog", { name: "Group visibility" })).toBeInTheDocument();
  });
});
