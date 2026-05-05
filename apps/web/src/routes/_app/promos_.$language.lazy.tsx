import type { Printing } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronRightIcon, LayoutGridIcon, ListIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { CardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { CardThumbnail, useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import type { PageTocItem } from "@/components/layout/page-toc";
import { PageToc } from "@/components/layout/page-toc";
import { MarkdownText } from "@/components/markdown-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLanguageList } from "@/hooks/use-enums";
import { publicPromoListQueryOptions } from "@/hooks/use-public-promos";
import type { ChannelNode } from "@/lib/promos-tree";
import { buildPromoTree, computeLanguageAggregates } from "@/lib/promos-tree";
import { cn, PAGE_PADDING } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

export const Route = createLazyFileRoute("/_app/promos_/$language")({
  component: PromosPage,
  pendingComponent: PromosPending,
});

type ViewMode = "grid" | "list";

const COMPACT_LEAF_THRESHOLD = 4;

// Mirrors both card grids below: cols 2 / 3@640 / 4@1280 / 6@1720 / 8@2160,
// gap-4 (16px) between cells, p-1.5 (6px) inside each cell, inside _app's
// CONTAINER_WIDTH cap (1280 → 1720@wide → 2160@xwide → 2560@xxwide), with
// PAGE_PADDING (px-3 = -24px) and an `lg:w-52` sidebar (208px) plus
// `gap-8` (32px) at lg+. Once the cap binds the per-cell size is constant,
// so the wide breakpoints use fixed px values.
const PROMOS_CARD_SIZES =
  "(min-width: 2560px) 261px, (min-width: 2160px) 211px, (min-width: 1720px) 217px, (min-width: 1280px) 230px, (min-width: 1024px) calc((100vw - 296px) / 3 - 12px), (min-width: 640px) calc((100vw - 56px) / 3 - 12px), calc((100vw - 40px) / 2 - 12px)";

/**
 * A branch qualifies for compact-table rendering when every direct child is a
 * leaf and each leaf has ≤ COMPACT_LEAF_THRESHOLD printings. This collapses
 * many sparse one-card sections into a single readable table.
 *
 * @returns True when the branch should render as a compact table.
 */
function isCompactBranch(node: ChannelNode): boolean {
  if (node.children.length === 0) {
    return false;
  }
  return node.children.every(
    (child) => child.children.length === 0 && child.printings.length <= COMPACT_LEAF_THRESHOLD,
  );
}

function formatLocalCount(printingCount: number): string {
  return `${printingCount} ${printingCount === 1 ? "printing" : "printings"}`;
}

function formatLanguageAggregate(
  languageLabel: string,
  printingCount: number,
  cardCount: number,
): string {
  const printingWord = printingCount === 1 ? "printing" : "printings";
  const cardWord = cardCount === 1 ? "card" : "cards";
  return `OpenRift currently has data on ${printingCount} ${languageLabel} promo ${printingWord} across ${cardCount} ${cardWord}.`;
}

/**
 * Walk the channel tree and collect every channel that carries at least one
 * printing. Compact leaves anchor themselves on the first card/row of the
 * merged grid/table, so their toc entries still resolve via DOM lookup.
 *
 * @returns Flat list of toc items in render order.
 */
function collectChannelTocItems(
  nodes: ChannelNode[],
  languageSectionId: string,
  depth: number,
  items: PageTocItem[],
): void {
  for (const node of nodes) {
    if (node.localPrintingCount === 0) {
      continue;
    }
    items.push({
      id: `${languageSectionId}-ch-${node.channel.id}`,
      label: node.channel.label,
      level: depth,
    });
    if (node.children.length === 0) {
      continue;
    }
    collectChannelTocItems(node.children, languageSectionId, depth + 1, items);
  }
}

function PromosPage() {
  const { data } = useSuspenseQuery(publicPromoListQueryOptions);
  const { language: activeLanguage } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();
  const showImages = useDisplayStore((s) => s.showImages);
  const display = useCardThumbnailDisplay();
  const languageOrder = useDisplayStore((s) => s.languages);
  const languageList = useLanguageList();
  const languageLabelMap = new Map(languageList.map((l) => [l.code, l.name]));

  const presentLanguageSet = new Set(data.printings.map((p) => p.language));
  const presentLanguages = [
    ...languageOrder.filter((lang) => presentLanguageSet.has(lang)),
    ...[...presentLanguageSet].filter((lang) => !languageOrder.includes(lang)).toSorted(),
  ];

  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const activeTree = useMemo(() => {
    const perChannel = new Map<string, Printing[]>();
    for (const printing of data.printings) {
      if (printing.language !== activeLanguage) {
        continue;
      }
      for (const link of printing.distributionChannels) {
        const list = perChannel.get(link.channel.id);
        if (list) {
          list.push(printing);
        } else {
          perChannel.set(link.channel.id, [printing]);
        }
      }
    }
    return buildPromoTree(data.channels, perChannel);
  }, [data.channels, data.printings, activeLanguage]);

  const activeAggregate = useMemo(
    () => computeLanguageAggregates(data.printings).get(activeLanguage),
    [data.printings, activeLanguage],
  );

  const activePrefix = `lang-${activeLanguage}`;

  const tocItems: PageTocItem[] = [];
  collectChannelTocItems(activeTree, activePrefix, 0, tocItems);

  const languageItems = presentLanguages.map((code) => ({
    value: code,
    label: languageLabelMap.get(code) ?? code,
  }));

  // Hash-scroll: TanStack Router navigations land before the lazy route's
  // content is in the DOM, so the native browser scroll-to-hash misses the
  // target. Re-run whenever the hash changes or the active language switches.
  useEffect(() => {
    if (!location.hash) {
      return;
    }
    // oxlint-disable-next-line prefer-query-selector -- section ids may start with a digit after the "ch-" prefix; getElementById avoids CSS-escape gymnastics.
    const element = document.getElementById(location.hash);
    if (element) {
      element.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, [location.hash, activeLanguage]);

  function handleLanguageChange(next: string | null) {
    if (!next || next === activeLanguage) {
      return;
    }
    void navigate({ to: "/promos/$language", params: { language: next }, hash: "" });
  }

  const handleCardClick = (printing: Printing) => {
    const { href } = router.buildLocation({
      to: "/cards/$cardSlug",
      params: { cardSlug: printing.card.slug },
      search: { printingId: printing.id },
    });
    window.open(href, "_blank", "noreferrer");
  };

  return (
    <div className={PAGE_PADDING}>
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Promos</h1>
          {presentLanguages.length > 1 ? (
            <Select
              items={languageItems}
              value={activeLanguage}
              onValueChange={handleLanguageChange}
            >
              <SelectTrigger size="sm" aria-label="Language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languageItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-muted-foreground text-sm">
              {languageLabelMap.get(activeLanguage) ?? activeLanguage}
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          Promos are all the cards you can&apos;t get by just opening booster packs. Two things vary
          across them: <strong className="font-semibold">how they look</strong>, shown as markers
          below each card (like &ldquo;Promo&rdquo; or &ldquo;Champion&rdquo;), and{" "}
          <strong className="font-semibold">where you can get them</strong>, which is how the
          sections below are organized (tournament prizes, event exclusives, bundles, or promo
          packs).
        </p>
        {activeAggregate && (
          <p className="text-muted-foreground mt-2 text-sm">
            {formatLanguageAggregate(
              languageLabelMap.get(activeLanguage) ?? activeLanguage,
              activeAggregate.printingCount,
              activeAggregate.cardCount,
            )}
          </p>
        )}
      </div>

      <div className="flex gap-8">
        <PageToc items={tocItems} className="lg:w-52" />

        <div className="min-w-0 flex-1">
          <div className="mb-6 flex items-center justify-end gap-1">
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="icon-sm"
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGridIcon className="size-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="icon-sm"
              onClick={() => setViewMode("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
            >
              <ListIcon className="size-4" />
            </Button>
          </div>

          {activeTree.length === 0 ? (
            <p className="text-muted-foreground text-sm">No promos yet.</p>
          ) : (
            <div className="space-y-8">
              {activeTree.map((root) => (
                <ChannelBranch
                  key={root.channel.id}
                  node={root}
                  depth={0}
                  ancestors={[]}
                  languagePrefix={activePrefix}
                  viewMode={viewMode}
                  showImages={showImages}
                  display={display}
                  onCardClick={handleCardClick}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface BranchProps {
  node: ChannelNode;
  depth: number;
  ancestors: string[];
  languagePrefix: string;
  viewMode: ViewMode;
  showImages: boolean;
  display: CardThumbnailDisplay;
  onCardClick: (printing: Printing) => void;
}

function ChannelBranch({
  node,
  depth,
  ancestors,
  languagePrefix,
  viewMode,
  showImages,
  display,
  onCardClick,
}: BranchProps) {
  const [open, setOpen] = useState(true);
  if (node.localPrintingCount === 0) {
    return null;
  }
  const isLeaf = node.children.length === 0;
  // Compact mode collapses sparse child leaves onto a single row: a shared
  // table in list view, side-by-side mini-grids in grid view. Applies whenever
  // every direct child is a leaf with few enough printings.
  const compact = !isLeaf && isCompactBranch(node);
  const sectionId = `${languagePrefix}-ch-${node.channel.id}`;

  if (isLeaf) {
    return (
      <ChannelLeafSection
        node={node}
        depth={depth}
        ancestors={ancestors}
        languagePrefix={languagePrefix}
        viewMode={viewMode}
        showImages={showImages}
        display={display}
        onCardClick={onCardClick}
      />
    );
  }

  const childAncestors = [...ancestors, node.channel.label];

  return (
    <section id={sectionId} className="scroll-mt-16">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/50 relative -mr-2 mb-2 flex w-full items-start gap-1 rounded py-1 pr-2 text-left md:-ml-6 md:block md:pl-6"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDownIcon
            aria-hidden
            className="text-muted-foreground mt-1.5 size-4 shrink-0 md:absolute md:top-2 md:left-1 md:mt-0"
          />
        ) : (
          <ChevronRightIcon
            aria-hidden
            className="text-muted-foreground mt-1.5 size-4 shrink-0 md:absolute md:top-2 md:left-1 md:mt-0"
          />
        )}
        <div className="min-w-0">
          <BranchHeading depth={depth} ancestors={ancestors}>
            {node.channel.label}
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              ({formatLocalCount(node.localPrintingCount)})
            </span>
          </BranchHeading>
          {node.channel.description && (
            <MarkdownText
              text={node.channel.description}
              className="text-muted-foreground text-sm"
            />
          )}
        </div>
      </button>
      {open && (
        <div>
          {compact && viewMode === "list" ? (
            <CompactBranchTable
              node={node}
              languagePrefix={languagePrefix}
              onCardClick={onCardClick}
            />
          ) : compact && viewMode === "grid" ? (
            <CompactBranchGrid
              node={node}
              languagePrefix={languagePrefix}
              showImages={showImages}
              display={display}
              onCardClick={onCardClick}
            />
          ) : (
            <div className="space-y-6">
              {node.children.map((child) => (
                <ChannelBranch
                  key={child.channel.id}
                  node={child}
                  depth={depth + 1}
                  ancestors={childAncestors}
                  languagePrefix={languagePrefix}
                  viewMode={viewMode}
                  showImages={showImages}
                  display={display}
                  onCardClick={onCardClick}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const BREADCRUMB_SEP = " › ";

function BranchHeading({
  depth,
  ancestors,
  children,
}: {
  depth: number;
  ancestors: string[];
  children: React.ReactNode;
}) {
  const Tag = depth === 0 ? "h3" : depth === 1 ? "h4" : "h5";
  const sizeClass = depth === 0 ? "text-lg font-semibold" : "text-base font-semibold";
  return (
    <Tag className={sizeClass}>
      {ancestors.length > 0 && (
        <span className="text-muted-foreground font-normal">
          {ancestors.join(BREADCRUMB_SEP)}
          {BREADCRUMB_SEP}
        </span>
      )}
      {children}
    </Tag>
  );
}

function ChannelLeafSection({
  node,
  depth,
  ancestors,
  languagePrefix,
  viewMode,
  showImages,
  display,
  onCardClick,
}: BranchProps) {
  const [open, setOpen] = useState(true);
  const sortedPrintings = node.printings.toSorted(comparePrintingsForDisplay);
  if (sortedPrintings.length === 0) {
    return null;
  }
  const sectionId = `${languagePrefix}-ch-${node.channel.id}`;
  return (
    <section id={sectionId} className="scroll-mt-16">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:bg-muted/50 relative -mr-2 mb-3 flex w-full items-start gap-1 rounded py-1 pr-2 text-left md:-ml-6 md:block md:pl-6"
      >
        {open ? (
          <ChevronDownIcon
            aria-hidden
            className="text-muted-foreground mt-1.5 size-4 shrink-0 md:absolute md:top-2 md:left-1 md:mt-0"
          />
        ) : (
          <ChevronRightIcon
            aria-hidden
            className="text-muted-foreground mt-1.5 size-4 shrink-0 md:absolute md:top-2 md:left-1 md:mt-0"
          />
        )}
        <div className="min-w-0">
          <BranchHeading depth={depth} ancestors={ancestors}>
            {node.channel.label}
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              ({formatLocalCount(sortedPrintings.length)})
            </span>
          </BranchHeading>
          {node.channel.description && (
            <MarkdownText
              text={node.channel.description}
              className="text-muted-foreground text-sm"
            />
          )}
        </div>
      </button>
      {open &&
        (viewMode === "grid" ? (
          <div className="wide:grid-cols-6 xwide:grid-cols-8 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {sortedPrintings.map((printing) => (
              <CardThumbnail
                key={printing.id}
                printing={printing}
                onClick={onCardClick}
                showImages={showImages}
                display={display}
                sizes={PROMOS_CARD_SIZES}
                belowLabel={<MarkerChips printing={printing} />}
              />
            ))}
          </div>
        ) : (
          <PromoListView printings={sortedPrintings} onRowClick={onCardClick} />
        ))}
    </section>
  );
}

function CompactBranchGrid({
  node,
  languagePrefix,
  showImages,
  display,
  onCardClick,
}: {
  node: ChannelNode;
  languagePrefix: string;
  showImages: boolean;
  display: CardThumbnailDisplay;
  onCardClick: (printing: Printing) => void;
}) {
  // Flatten every leaf's printings into one grid that uses the normal card
  // sizing, so compact mode is just rows-vs-cols: each card carries a small
  // label telling you which sibling channel it came from. Tag the first card
  // of each leaf with the leaf's section id so cross-route hash links still
  // scroll to the right cell even though the leaf has no section of its own.
  const entries = node.children.flatMap((child) =>
    child.printings.toSorted(comparePrintingsForDisplay).map((printing, printingIndex) => ({
      printing,
      leafLabel: child.channel.label,
      anchorId: printingIndex === 0 ? `${languagePrefix}-ch-${child.channel.id}` : undefined,
    })),
  );
  const legend = node.children.filter(
    (child) => child.channel.description && child.printings.length > 0,
  );
  return (
    <>
      {legend.length > 0 && (
        <dl className="mb-3 space-y-0.5 text-sm">
          {legend.map((child) => (
            <div key={child.channel.id} className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">{child.channel.label}</dt>
              <dd className="text-muted-foreground min-w-0">
                <MarkdownText text={child.channel.description ?? ""} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="wide:grid-cols-6 xwide:grid-cols-8 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {entries.map(({ printing, leafLabel, anchorId }) => (
          <div
            key={`${leafLabel}-${printing.id}`}
            id={anchorId}
            className={anchorId ? "scroll-mt-16" : undefined}
          >
            <div className="mb-1 px-1.5 font-semibold">{leafLabel}</div>
            <CardThumbnail
              printing={printing}
              onClick={onCardClick}
              showImages={showImages}
              display={display}
              sizes={PROMOS_CARD_SIZES}
              belowLabel={<MarkerChips printing={printing} />}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function CompactBranchTable({
  node,
  languagePrefix,
  onCardClick,
}: {
  node: ChannelNode;
  languagePrefix: string;
  onCardClick: (printing: Printing) => void;
}) {
  const columnHeader = node.channel.childrenLabel ?? "Variant";
  const rows = node.children.flatMap((child) =>
    child.printings.toSorted(comparePrintingsForDisplay).map((printing, printingIndex) => ({
      printing,
      leafLabel: child.channel.label,
      anchorId: printingIndex === 0 ? `${languagePrefix}-ch-${child.channel.id}` : undefined,
    })),
  );
  if (rows.length === 0) {
    return null;
  }
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">{columnHeader}</TableHead>
          <TableHead>Card</TableHead>
          <TableHead className="w-40">Code</TableHead>
          <TableHead className="w-32">Finish</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ printing, leafLabel, anchorId }) => {
          const image = printing.images[0];
          return (
            <HoverCard key={`${leafLabel}-${printing.id}`}>
              <HoverCardTrigger
                render={
                  <TableRow
                    id={anchorId}
                    onClick={() => onCardClick(printing)}
                    className={cn("hover:bg-muted/50 cursor-pointer", anchorId && "scroll-mt-16")}
                  />
                }
              >
                <TableCell className="truncate font-medium">{leafLabel}</TableCell>
                <TableCell className="truncate">{printing.card.name}</TableCell>
                <TableCell className="text-muted-foreground truncate tabular-nums">
                  {printing.publicCode}
                </TableCell>
                <TableCell className="truncate">{printing.finish}</TableCell>
              </HoverCardTrigger>
              {image && (
                <HoverCardContent
                  side="right"
                  className="w-auto border-0 bg-transparent p-0 shadow-none ring-0"
                >
                  <img
                    src={imageUrl(image.imageId, "full")}
                    alt={printing.card.name}
                    className="h-96 w-auto rounded-lg shadow-xl"
                  />
                </HoverCardContent>
              )}
            </HoverCard>
          );
        })}
      </TableBody>
    </Table>
  );
}

function comparePrintingsForDisplay(a: Printing, b: Printing) {
  return a.canonicalRank - b.canonicalRank;
}

function PromoListView({
  printings,
  onRowClick,
}: {
  printings: Printing[];
  onRowClick: (printing: Printing) => void;
}) {
  return (
    <>
      {/* Desktop: table with hover-to-preview */}
      <div className="hidden md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-40">Code</TableHead>
              <TableHead className="w-32">Rarity</TableHead>
              <TableHead className="w-32">Finish</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {printings.map((printing) => {
              const image = printing.images[0];
              return (
                <HoverCard key={printing.id}>
                  <HoverCardTrigger
                    render={
                      <TableRow
                        onClick={() => onRowClick(printing)}
                        className="hover:bg-muted/50 cursor-pointer"
                      />
                    }
                  >
                    <TableCell className="truncate font-medium">{printing.card.name}</TableCell>
                    <TableCell className="text-muted-foreground truncate tabular-nums">
                      {printing.publicCode}
                    </TableCell>
                    <TableCell className="truncate">{printing.rarity}</TableCell>
                    <TableCell className="truncate">{printing.finish}</TableCell>
                  </HoverCardTrigger>
                  {image && (
                    <HoverCardContent
                      side="right"
                      className="w-auto border-0 bg-transparent p-0 shadow-none ring-0"
                    >
                      <img
                        src={imageUrl(image.imageId, "full")}
                        alt={printing.card.name}
                        className="h-96 w-auto rounded-lg shadow-xl"
                      />
                    </HoverCardContent>
                  )}
                </HoverCard>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {printings.map((printing) => {
          const image = printing.images[0];
          return (
            <button
              key={printing.id}
              type="button"
              onClick={() => onRowClick(printing)}
              className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-lg border p-2 text-left"
            >
              {image ? (
                <img
                  src={imageUrl(image.imageId, "400w")}
                  alt={printing.card.name}
                  className="aspect-card h-20 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="bg-muted aspect-card h-20 shrink-0 rounded" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{printing.card.name}</div>
                <div className="text-muted-foreground truncate text-xs tabular-nums">
                  {printing.publicCode}
                </div>
                <div className="text-muted-foreground truncate">
                  {printing.rarity} · {printing.finish}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function MarkerChips({ printing }: { printing: Printing }) {
  if (printing.markers.length === 0) {
    return null;
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {printing.markers.map((marker) => (
        <Badge key={marker.id} variant="secondary" title={marker.description ?? undefined}>
          {marker.label}
        </Badge>
      ))}
    </div>
  );
}

function PromosPending() {
  return (
    <div className={PAGE_PADDING}>
      <Skeleton className="mb-1 h-8 w-48" />
      <Skeleton className="mb-6 h-5 w-64" />
      <Skeleton className="mb-2 h-7 w-36" />
      <Skeleton className="mb-4 h-4 w-48" />
      <div className="wide:grid-cols-6 xwide:grid-cols-8 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="p-1.5">
            <Skeleton className="aspect-card rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
