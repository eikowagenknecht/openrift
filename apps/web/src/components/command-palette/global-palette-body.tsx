import { legendDisplayName } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Command as CommandPrimitive } from "cmdk";
import {
  ArrowRightLeftIcon,
  CircleHelpIcon,
  GavelIcon,
  LayersIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import { PrintingRowContent } from "@/components/cards/printing-row";
import { visibleHelpArticles } from "@/components/help/articles";
import type { LockedFeatureKey, NavFlags } from "@/components/layout/nav-items";
import { MORE_NAV_SECTIONS, PRIMARY_NAV_ITEMS } from "@/components/layout/nav-items";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { InputGroup, InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { useCards } from "@/hooks/use-cards";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useQuickAddSearch } from "@/hooks/use-quick-add-search";
import { useSession } from "@/lib/auth-session";
import type { PaletteRow } from "@/lib/command-palette-results";
import { buildPaletteGroups } from "@/lib/command-palette-results";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { useCommandPaletteStore } from "@/stores/command-palette-store";
import { useDisplayStore } from "@/stores/display-store";

const SEARCH_DEPTH = 12;

interface GlobalPaletteBodyProps {
  onOpenCard: (printingId: string, sequence: string[]) => void;
  onLockedFeature: (key: LockedFeatureKey) => void;
}

export function GlobalPaletteBody({ onOpenCard, onLockedFeature }: GlobalPaletteBodyProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { printingsByCardId } = useCards();
  const preferredLanguages = useDisplayStore((state) => state.languages);
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const { data: rawFlags } = useSuspenseQuery(featureFlagsQueryOptions);
  const flags = rawFlags as FeatureFlags;
  const quickAdd = useCommandPaletteStore((state) => state.quickAdd);
  const openQuickAdd = useCommandPaletteStore((state) => state.openQuickAdd);
  const closePalette = useCommandPaletteStore((state) => state.closePalette);
  const hidePalette = useCommandPaletteStore((state) => state.hidePalette);
  const query = useCommandPaletteStore((state) => state.query);
  const setQuery = useCommandPaletteStore((state) => state.setQuery);
  const highlighted = useCommandPaletteStore((state) => state.highlighted);
  const setHighlighted = useCommandPaletteStore((state) => state.setHighlighted);

  const cards = useQuickAddSearch(query, printingsByCardId, {
    preferredLanguages,
    limit: SEARCH_DEPTH,
  });

  const navFlags: NavFlags = {
    glossary: featureEnabled(flags, "glossary"),
    meta: featureEnabled(flags, "meta"),
  };
  const navItems = [...PRIMARY_NAV_ITEMS, ...MORE_NAV_SECTIONS.flatMap((s) => s.items)].filter(
    (item) => item.flag === undefined || navFlags[item.flag],
  );

  const groups = buildPaletteGroups({
    query,
    cards,
    navItems,
    helpArticles: visibleHelpArticles(flags),
    quickAdd,
  });

  const rowIds = groups.flatMap((group) => group.rows).map((row) => row.id);
  // cmdk's own value tracking keeps pointing at a deleted row; fall back to
  // the first row when the highlighted one no longer exists.
  const activeValue = rowIds.includes(highlighted) ? highlighted : (rowIds[0] ?? "");

  const cardSequence = groups
    .flatMap((group) => group.rows)
    .filter((row) => row.kind === "card")
    .map((row) => row.card.defaultPrinting.id);

  const handleSelect = (row: PaletteRow) => {
    if (row.kind === "card") {
      // Hidden, not closed, so dismissing the detail restores this list and query.
      hidePalette();
      onOpenCard(row.card.defaultPrinting.id, cardSequence);
      return;
    }
    if (row.kind === "quickAdd") {
      openQuickAdd(row.verb);
      return;
    }
    if (row.kind === "nav") {
      const lockedKey = row.item.lockedKey;
      closePalette();
      if (lockedKey && !isLoggedIn) {
        onLockedFeature(lockedKey);
        return;
      }
      void navigate({ to: row.item.to });
      return;
    }
    closePalette();
    if (row.kind === "help") {
      void navigate({ to: "/help/$slug", params: { slug: row.article.slug } });
      return;
    }
    if (row.kind === "searchCards") {
      void navigate({ to: "/cards", search: { search: row.query } });
      return;
    }
    void navigate({ to: "/rules/$kind", params: { kind: "core" }, search: { q: row.query } });
  };

  return (
    <Command
      shouldFilter={false}
      value={activeValue}
      onValueChange={setHighlighted}
      className="bg-transparent p-0"
    >
      {/* Not ui/command's CommandInput, which is styled for the inline pickers. */}
      <InputGroup className="h-11 border-0 has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-transparent">
        <InputGroupAddon align="inline-start">
          <SearchIcon className="text-muted-foreground size-4" />
        </InputGroupAddon>
        <CommandPrimitive.Input
          value={query}
          onValueChange={setQuery}
          aria-label="Search cards, pages and help"
          placeholder="Search cards, pages and help..."
          className="w-full bg-transparent text-base outline-hidden sm:text-sm"
          autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- command palette, always focused on open
        />
        {query && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" onClick={() => setQuery("")} aria-label="Clear search">
              <XIcon className="size-4" />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <div className="border-border border-t" />

      <CommandList className={isMobile ? "max-h-[50dvh]" : "max-h-96"}>
        <CommandEmpty className="text-muted-foreground px-3 py-8 text-center">
          Nothing matches that.
        </CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.heading} heading={group.heading}>
            {group.rows.map((row) => (
              <CommandItem key={row.id} value={row.id} onSelect={() => handleSelect(row)}>
                <PaletteRowContent row={row} />
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      {!isMobile && <PaletteFooterHint />}
    </Command>
  );
}

function PaletteRowContent({ row }: { row: PaletteRow }) {
  if (row.kind === "card") {
    return (
      <PrintingRowContent
        printing={row.card.defaultPrinting}
        siblings={row.card.printings}
        name={legendDisplayName(row.card.defaultPrinting.card)}
      />
    );
  }
  if (row.kind === "quickAdd") {
    return (
      <>
        {row.verb === "add" ? <PlusIcon /> : <ArrowRightLeftIcon />}
        <span className="truncate">{row.label}</span>
      </>
    );
  }
  if (row.kind === "nav") {
    return (
      <>
        <row.item.icon />
        <span className="truncate">{row.item.label}</span>
      </>
    );
  }
  if (row.kind === "help") {
    return (
      <>
        <CircleHelpIcon />
        <span className="truncate">{row.article.title}</span>
      </>
    );
  }
  if (row.kind === "searchCards") {
    return (
      <>
        <LayersIcon />
        <span className="truncate">Search all cards for &ldquo;{row.query}&rdquo;</span>
      </>
    );
  }
  return (
    <>
      <GavelIcon />
      <span className="truncate">Search rules for &ldquo;{row.query}&rdquo;</span>
    </>
  );
}

function PaletteFooterHint() {
  return (
    <div className="text-muted-foreground border-border flex items-center gap-3 border-t px-3 py-2 text-xs">
      <span className="flex items-center gap-1">
        <Kbd>↵</Kbd> open
      </span>
      <span className="flex items-center gap-1">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd> navigate
      </span>
      <span className="ml-auto flex items-center gap-1">
        <Kbd>Esc</Kbd> close
      </span>
    </div>
  );
}
