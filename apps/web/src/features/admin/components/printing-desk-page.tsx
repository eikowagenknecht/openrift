import type { DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";
import { enumLabel } from "@openrift/shared/enum-label";
import { formatDay, formatDayTimeLocal, formatRelativeTime } from "@openrift/shared/format-date";
import { formatPrintingCode } from "@openrift/shared/printing-code";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, DownloadIcon, PlusIcon, SearchIcon, Share2Icon } from "lucide-react";
import { useState } from "react";

import { LanguageChip } from "@/components/language-chip";
import {
  PageDescription,
  PageTopBarButton,
  PageTopBarPrimaryButton,
} from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardList } from "@/components/ui/card-list";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageTopBar } from "@/features/admin/components/admin-page-top-bar";
import { PrintingDeskCardSearchDialog } from "@/features/admin/components/printing-desk-card-search";
import {
  DeskSegmented,
  DeskStatusBadge,
  DeskThumb,
} from "@/features/admin/components/printing-desk-shared";
import { useIsAdmin } from "@/features/admin/hooks/use-admin";
import type { DeskListMode } from "@/features/admin/hooks/use-printing-desk";
import { useDeskPrintings } from "@/features/admin/hooks/use-printing-desk";
import {
  buildPrintingDeskCsv,
  printingDeskCsvFilename,
} from "@/features/admin/lib/printing-desk-csv";
import type { DeskSort, DeskStatusFilter } from "@/features/admin/lib/printing-desk-filter";
import {
  filterDeskPrintings,
  imageCountText,
  sortDeskPrintings,
} from "@/features/admin/lib/printing-desk-filter";
import { encodePostSlides } from "@/features/admin/lib/printing-post-slides";
import { buildChannelBreadcrumbsBySlug } from "@/features/cards/lib/channel-breadcrumbs";
import { downloadCSV } from "@/features/collections/lib/csv-export";
import { useDistributionChannels } from "@/hooks/use-distribution-channels";
import { useEnumOrders } from "@/hooks/use-enums";
import { useMarkers } from "@/hooks/use-markers";
import { getSiteUrl } from "@/lib/site-config";

const MODE_OPTIONS = [
  { value: "mine", label: "Added by you" },
  { value: "all", label: "All promos" },
] as const satisfies readonly { value: DeskListMode; label: string }[];

const STATUS_OPTIONS = [
  { value: "any", label: "Any status" },
  { value: "announced", label: "Announced" },
  { value: "released", label: "Released" },
] as const satisfies readonly { value: DeskStatusFilter; label: string }[];

const SORT_OPTIONS = [
  { value: "code", label: "By code" },
  { value: "card", label: "By card name" },
  { value: "updated", label: "Last updated" },
  { value: "release", label: "Available from" },
] as const satisfies readonly { value: DeskSort; label: string }[];

export function PrintingDeskPage() {
  const { data: isAdmin } = useIsAdmin();
  const [modeOverride, setModeOverride] = useState<DeskListMode | null>(null);
  const mode = modeOverride ?? (isAdmin ? "all" : "mine");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DeskStatusFilter>("any");
  const [sort, setSort] = useState<DeskSort>("code");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const { data, isPending } = useDeskPrintings(mode);
  const { data: channelData } = useDistributionChannels();
  const { data: markerData } = useMarkers();
  const { labels } = useEnumOrders();

  const channelPaths = buildChannelBreadcrumbsBySlug(channelData.distributionChannels);
  const markerLabels = new Map(markerData.markers.map((marker) => [marker.slug, marker.label]));
  const rows = sortDeskPrintings(
    filterDeskPrintings(data?.printings ?? [], { query, status }),
    sort,
  );

  const selectedRows = (data?.printings ?? []).filter((row) => selected.has(row.printingId));
  const postSlides = selectedRows.flatMap((row) =>
    row.activeImageFileId === null
      ? []
      : [{ printingId: row.printingId, imageFileId: row.activeImageFileId }],
  );
  const withoutImage = selectedRows.length - postSlides.length;

  function handleExport() {
    const csv = buildPrintingDeskCsv(rows, { channelPaths, siteUrl: getSiteUrl() });
    downloadCSV(csv, printingDeskCsvFilename(mode, formatDay(new Date())));
  }

  function toggleSelected(printingId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(printingId);
      } else {
        next.delete(printingId);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <AdminPageTopBar
        title="Your printings"
        actions={
          <>
            <PageTopBarButton onClick={handleExport} disabled={rows.length === 0}>
              <DownloadIcon />
              Export CSV
            </PageTopBarButton>
            <PageTopBarPrimaryButton onClick={() => setSearchOpen(true)}>
              <PlusIcon />
              New printing
            </PageTopBarPrimaryButton>
          </>
        }
      />

      <PageDescription>
        Every promo printing you added or edited. Open a row to edit it and add images, or tick a
        few and make one post out of them.
      </PageDescription>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-72">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Card name or code…"
            aria-label="Filter by card name or code"
            className="pl-8"
          />
        </div>

        <DeskSegmented
          ariaLabel="Which printings to show"
          value={mode}
          onChange={setModeOverride}
          options={MODE_OPTIONS}
        />

        <Select
          items={STATUS_OPTIONS}
          value={status}
          onValueChange={(value) => {
            if (value !== null) {
              setStatus(value);
            }
          }}
        >
          <SelectTrigger className="w-36" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={SORT_OPTIONS}
          value={sort}
          onValueChange={(value) => {
            if (value !== null) {
              setSort(value);
            }
          }}
        >
          <SelectTrigger className="w-44" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm">{selectedRows.length} selected</span>
            {postSlides.length === 0 ? (
              <Button variant="outline" size="sm" disabled>
                <Share2Icon />
                Make a post
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                render={
                  <Link
                    to="/admin/printing-desk/post"
                    search={{ slides: encodePostSlides(postSlides) }}
                  />
                }
              >
                <Share2Icon />
                Make a post
              </Button>
            )}
            {withoutImage > 0 && (
              <span className="text-muted-foreground text-xs">
                {withoutImage === 1
                  ? "1 without an image was left out"
                  : `${withoutImage} without an image were left out`}
              </span>
            )}
          </div>
        )}

        <span className="text-muted-foreground ml-auto text-sm">
          {rows.length} {rows.length === 1 ? "printing" : "printings"}
        </span>
      </div>

      {isPending && !data ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PlusIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing here yet</EmptyTitle>
            <EmptyDescription>
              {data?.printings.length === 0
                ? "Start with “New printing” and pick the card the promo belongs to."
                : "No printing matches the filter. Widen it to see the rest."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <CardList>
          {rows.map((row) => (
            <DeskPrintingListRow
              key={row.printingId}
              row={row}
              channelPath={row.distributionChannelSlugs
                .map((slug) => channelPaths.get(slug) ?? slug)
                .join(", ")}
              markerLabels={markerLabels}
              finishLabel={enumLabel(labels.finishes, row.finish)}
              selected={selected.has(row.printingId)}
              onSelectedChange={(checked) => toggleSelected(row.printingId, checked)}
            />
          ))}
        </CardList>
      )}

      <PrintingDeskCardSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

function DeskPrintingListRow({
  row,
  channelPath,
  markerLabels,
  finishLabel,
  selected,
  onSelectedChange,
}: {
  row: DeskPrintingRow;
  channelPath: string;
  markerLabels: ReadonlyMap<string, string>;
  finishLabel: string;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
}) {
  return (
    <li className="hover:bg-muted/50 has-[a:focus-visible]:ring-ring/50 relative flex items-center gap-3 rounded-md px-2 py-2 has-[a:focus-visible]:ring-2">
      {/* Above the row link's inset-0 overlay, or the tick would open the printing. */}
      <Checkbox
        aria-label={`Select ${row.cardName}`}
        className="relative z-10"
        checked={selected}
        onCheckedChange={(checked) => onSelectedChange(checked === true)}
        onClick={(event) => event.stopPropagation()}
      />

      <DeskThumb row={row} className="h-12" />

      <div className="min-w-0 flex-1">
        {/* The ::after resolves against the row, the only positioned ancestor. */}
        <Link
          to="/admin/printing-desk/printings/$printingId"
          params={{ printingId: row.printingId }}
          className="block truncate rounded-md font-medium outline-none after:absolute after:inset-0"
        >
          {row.cardName}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {row.markerSlugs.map((slug) => (
            <Badge key={slug} variant="subtle">
              {markerLabels.get(slug) ?? slug}
            </Badge>
          ))}
        </div>
      </div>

      <span className="hidden w-40 shrink-0 truncate font-mono text-sm sm:block">
        {formatPrintingCode(row.publicCode)}
      </span>
      <span className="text-muted-foreground hidden w-28 shrink-0 truncate text-sm lg:block">
        {finishLabel}
      </span>
      <span className="hidden w-12 shrink-0 lg:block">
        <LanguageChip code={row.language} />
      </span>
      <span className="text-muted-foreground hidden w-72 shrink-0 truncate text-sm xl:block">
        {channelPath}
      </span>

      <DeskStatusBadge row={row} />

      <span className="text-muted-foreground hidden w-20 shrink-0 text-right text-sm md:block">
        {imageCountText(row.imageCount)}
      </span>
      <span
        className="text-muted-foreground hidden w-24 shrink-0 text-right text-sm lg:block"
        title={formatDayTimeLocal(row.updatedAt)}
      >
        {formatRelativeTime(row.updatedAt)}
      </span>

      <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
    </li>
  );
}
