import type { DistributionChannelWithCount, Printing } from "@openrift/shared";
import { comparePrintings } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronRightIcon, LayoutGridIcon, ListIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { MarkdownText } from "@/components/markdown-text";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
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
import { PAGE_PADDING } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

export const Route = createLazyFileRoute("/_app/promos")({
  component: PromosPage,
  pendingComponent: PromosPending,
});

type ViewMode = "grid" | "list";

interface ChannelNode {
  channel: DistributionChannelWithCount;
  children: ChannelNode[];
  /** Direct printings on this channel (only leaves carry these). */
  printings: Printing[];
}

const COMPACT_LEAF_THRESHOLD = 4;

/**
 * Build a tree of event channels with each leaf's printings attached. Sibling
 * order is sortOrder, then label.
 *
 * @returns Root nodes of the channel tree.
 */
function buildPromoTree(
  channels: DistributionChannelWithCount[],
  printingsByChannelId: Map<string, Printing[]>,
): ChannelNode[] {
  const byParent = new Map<string | null, DistributionChannelWithCount[]>();
  for (const channel of channels) {
    const list = byParent.get(channel.parentId);
    if (list) {
      list.push(channel);
    } else {
      byParent.set(channel.parentId, [channel]);
    }
  }
  function build(parentId: string | null): ChannelNode[] {
    const siblings = byParent.get(parentId);
    if (!siblings) {
      return [];
    }
    return siblings.map((channel) => ({
      channel,
      children: build(channel.id),
      printings: printingsByChannelId.get(channel.id) ?? [],
    }));
  }
  return build(null);
}

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

function formatCounts(counts: { cardCount: number; printingCount: number }): string {
  const noun = counts.printingCount === 1 ? "printing" : "printings";
  if (counts.cardCount === counts.printingCount) {
    return `${counts.printingCount} ${noun}`;
  }
  return `${counts.printingCount} ${noun} · ${counts.cardCount} cards`;
}

function PromosPage() {
  const { data } = useSuspenseQuery(publicPromoListQueryOptions);
  const navigate = useNavigate();
  const showImages = useDisplayStore((s) => s.showImages);
  const languageOrder = useDisplayStore((s) => s.languages);
  const languageList = useLanguageList();
  const languageLabelMap = new Map(languageList.map((l) => [l.code, l.name]));

  const presentLanguageSet = new Set(data.printings.map((p) => p.language));
  const presentLanguages = [
    ...languageOrder.filter((lang) => presentLanguageSet.has(lang)),
    ...[...presentLanguageSet].filter((lang) => !languageOrder.includes(lang)).toSorted(),
  ];

  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Index printings per language → channel id, then build a per-language tree.
  const treesByLanguage = useMemo(() => {
    const byLang = new Map<string, Map<string, Printing[]>>();
    for (const printing of data.printings) {
      for (const link of printing.distributionChannels) {
        if (link.channel.kind !== "event") {
          continue;
        }
        let perChannel = byLang.get(printing.language);
        if (!perChannel) {
          perChannel = new Map();
          byLang.set(printing.language, perChannel);
        }
        const list = perChannel.get(link.channel.id);
        if (list) {
          list.push(printing);
        } else {
          perChannel.set(link.channel.id, [printing]);
        }
      }
    }
    const out = new Map<string, ChannelNode[]>();
    for (const [lang, perChannel] of byLang) {
      out.set(lang, buildPromoTree(data.channels, perChannel));
    }
    return out;
  }, [data.channels, data.printings]);

  const handleCardClick = (printing: Printing) => {
    void navigate({
      to: "/cards/$cardSlug",
      params: { cardSlug: printing.card.slug },
      search: { printingId: printing.id },
    });
  };

  return (
    <div className={PAGE_PADDING}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Promo Cards</h1>
        <p className="text-muted-foreground max-w-prose text-sm">
          Promos are alternate printings distributed outside booster products: prerelease giveaways,
          store championship prizes, and event exclusives. Sections are grouped by language, then by
          event hierarchy.
        </p>
      </div>

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

      {presentLanguages.length === 0 && (
        <p className="text-muted-foreground text-sm">No promos yet.</p>
      )}

      <div className="space-y-12">
        {presentLanguages.map((language) => {
          const tree = treesByLanguage.get(language);
          if (!tree || tree.length === 0) {
            return null;
          }
          const languageLabel = languageLabelMap.get(language) ?? language;
          return (
            <section key={language}>
              <h2 className="mb-4 border-b pb-2 text-2xl font-bold">{languageLabel}</h2>
              <div className="space-y-8">
                {tree.map((root) => (
                  <ChannelBranch
                    key={root.channel.id}
                    node={root}
                    depth={0}
                    viewMode={viewMode}
                    showImages={showImages}
                    onCardClick={handleCardClick}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

interface BranchProps {
  node: ChannelNode;
  depth: number;
  viewMode: ViewMode;
  showImages: boolean;
  onCardClick: (printing: Printing) => void;
}

function ChannelBranch({ node, depth, viewMode, showImages, onCardClick }: BranchProps) {
  const [open, setOpen] = useState(true);
  if (node.channel.printingCount === 0) {
    return null;
  }
  const isLeaf = node.children.length === 0;
  // Compact mode collapses every direct child into one table — only meaningful
  // in the grid view; the list view keeps its existing flat-table-per-leaf
  // layout for rows that look the same regardless of grouping.
  const compact = !isLeaf && viewMode === "grid" && isCompactBranch(node);

  if (isLeaf) {
    return (
      <ChannelLeafSection
        node={node}
        depth={depth}
        viewMode={viewMode}
        showImages={showImages}
        onCardClick={onCardClick}
      />
    );
  }

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/50 -mx-2 mb-2 flex w-full items-start gap-2 rounded px-2 py-1 text-left"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDownIcon className="text-muted-foreground mt-1 size-4 shrink-0" />
        ) : (
          <ChevronRightIcon className="text-muted-foreground mt-1 size-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <BranchHeading depth={depth}>{node.channel.label}</BranchHeading>
          {node.channel.description && (
            <MarkdownText
              text={node.channel.description}
              className="text-muted-foreground max-w-prose text-sm"
            />
          )}
          <p className="text-muted-foreground">{formatCounts(node.channel)}</p>
        </div>
      </button>
      {open && (
        <div className={depth >= 0 ? "pl-6" : undefined}>
          {compact ? (
            <CompactBranchTable node={node} onCardClick={onCardClick} />
          ) : (
            <div className="space-y-6">
              {node.children.map((child) => (
                <ChannelBranch
                  key={child.channel.id}
                  node={child}
                  depth={depth + 1}
                  viewMode={viewMode}
                  showImages={showImages}
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

function BranchHeading({ depth, children }: { depth: number; children: React.ReactNode }) {
  const Tag = depth === 0 ? "h3" : depth === 1 ? "h4" : "h5";
  const sizeClass = depth === 0 ? "text-lg font-semibold" : "text-base font-semibold";
  return <Tag className={sizeClass}>{children}</Tag>;
}

function ChannelLeafSection({ node, depth, viewMode, showImages, onCardClick }: BranchProps) {
  const sortedPrintings = node.printings.toSorted(comparePrintingsForDisplay);
  if (sortedPrintings.length === 0) {
    return null;
  }
  return (
    <section>
      <div className="mb-3">
        <BranchHeading depth={depth}>{node.channel.label}</BranchHeading>
        {node.channel.description && (
          <MarkdownText
            text={node.channel.description}
            className="text-muted-foreground max-w-prose text-sm"
          />
        )}
        <p className="text-muted-foreground">
          {sortedPrintings.length}
          {sortedPrintings.length === 1 ? " printing" : " printings"}
        </p>
      </div>
      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
          {sortedPrintings.map((printing) => (
            <CardThumbnail
              key={printing.id}
              printing={printing}
              onClick={onCardClick}
              showImages={showImages}
            />
          ))}
        </div>
      ) : (
        <PromoListView printings={sortedPrintings} onRowClick={onCardClick} />
      )}
    </section>
  );
}

function CompactBranchTable({
  node,
  onCardClick,
}: {
  node: ChannelNode;
  onCardClick: (printing: Printing) => void;
}) {
  const columnHeader = node.channel.childrenLabel ?? "Variant";
  const rows = node.children.flatMap((child) =>
    child.printings
      .toSorted(comparePrintingsForDisplay)
      .map((printing) => ({ printing, leafLabel: child.channel.label })),
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
        {rows.map(({ printing, leafLabel }) => {
          const image = printing.images[0];
          return (
            <HoverCard key={`${leafLabel}-${printing.id}`}>
              <HoverCardTrigger
                render={
                  <TableRow
                    onClick={() => onCardClick(printing)}
                    className="hover:bg-muted/50 cursor-pointer"
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
                    src={image.full}
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
  return comparePrintings(
    {
      setId: a.setId,
      shortCode: a.shortCode,
      finish: a.finish,
      markerSlugs: a.markers.map((m) => m.slug),
    },
    {
      setId: b.setId,
      shortCode: b.shortCode,
      finish: b.finish,
      markerSlugs: b.markers.map((m) => m.slug),
    },
  );
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
                        src={image.full}
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
                  src={image.thumbnail}
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

function PromosPending() {
  return (
    <div className={PAGE_PADDING}>
      <Skeleton className="mb-1 h-8 w-48" />
      <Skeleton className="mb-6 h-5 w-64" />
      <Skeleton className="mb-2 h-7 w-36" />
      <Skeleton className="mb-4 h-4 w-48" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="p-1.5">
            <Skeleton className="aspect-card rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
