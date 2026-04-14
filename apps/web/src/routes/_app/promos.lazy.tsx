import type { Printing } from "@openrift/shared";
import { comparePrintings } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import { useState } from "react";

import { CardThumbnail } from "@/components/cards/card-thumbnail";
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

  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(() => {
    if (presentLanguages.length === 0) {
      return new Set();
    }
    const preferred = new Set(languageOrder);
    const intersection = presentLanguages.filter((lang) => preferred.has(lang));
    return new Set(intersection.length > 0 ? intersection : presentLanguages);
  });

  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const toggleLanguage = (code: string) => {
    setSelectedLanguages((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const allSelected = selectedLanguages.size === presentLanguages.length;
  const toggleAll = () => {
    setSelectedLanguages(allSelected ? new Set() : new Set(presentLanguages));
  };

  const printingsByPromo = Map.groupBy(data.printings, (p) => p.promoType?.id ?? "");

  const handleCardClick = (printing: Printing) => {
    void navigate({ to: "/cards/$cardSlug", params: { cardSlug: printing.card.slug } });
  };

  const compareForDisplay = (a: Printing, b: Printing) => {
    const canonical = comparePrintings(
      {
        setId: a.setId,
        shortCode: a.shortCode,
        finish: a.finish,
        promoTypeSlug: a.promoType?.slug,
      },
      {
        setId: b.setId,
        shortCode: b.shortCode,
        finish: b.finish,
        promoTypeSlug: b.promoType?.slug,
      },
    );
    if (canonical !== 0) {
      return canonical;
    }
    const aIdx = languageOrder.indexOf(a.language);
    const bIdx = languageOrder.indexOf(b.language);
    const aPos = aIdx === -1 ? languageOrder.length : aIdx;
    const bPos = bIdx === -1 ? languageOrder.length : bIdx;
    return aPos - bPos || a.language.localeCompare(b.language);
  };

  return (
    <div className={PAGE_PADDING}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Promo Cards</h1>
        <p className="text-muted-foreground max-w-prose text-sm">
          Promos are alternate printings distributed outside booster products: prerelease giveaways,
          store championship prizes, and event exclusives. Each section below covers one promo type,
          with a printing count so you can see what you&apos;re chasing.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {presentLanguages.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm">Languages:</span>
            {presentLanguages.map((code) => {
              const isSelected = selectedLanguages.has(code);
              const label = languageLabelMap.get(code) ?? code;
              return (
                <Button
                  key={code}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleLanguage(code)}
                >
                  {label}
                </Button>
              );
            })}
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {allSelected ? "Clear all" : "Select all"}
            </Button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
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
      </div>

      {data.promoTypes.length === 0 && (
        <p className="text-muted-foreground text-sm">No promo types yet.</p>
      )}

      <div className="space-y-10">
        {data.promoTypes.map((promoType) => {
          const allPromoPrintings = printingsByPromo.get(promoType.id) ?? [];
          const filteredPrintings = allPromoPrintings.filter((p) =>
            selectedLanguages.has(p.language),
          );
          if (filteredPrintings.length === 0) {
            return null;
          }
          const sortedPrintings = filteredPrintings.toSorted(compareForDisplay);

          return (
            <section key={promoType.id}>
              <div className="mb-3">
                <h2 className="text-xl font-semibold">{promoType.label}</h2>
                {promoType.description && (
                  <p className="text-muted-foreground text-sm">{promoType.description}</p>
                )}
                <p className="text-muted-foreground text-xs">
                  {sortedPrintings.length} {sortedPrintings.length === 1 ? "printing" : "printings"}
                </p>
              </div>

              {viewMode === "grid" ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                  {sortedPrintings.map((printing) => (
                    <CardThumbnail
                      key={printing.id}
                      printing={printing}
                      onClick={handleCardClick}
                      showImages={showImages}
                    />
                  ))}
                </div>
              ) : (
                <PromoListView
                  printings={sortedPrintings}
                  onRowClick={handleCardClick}
                  languageLabelMap={languageLabelMap}
                />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PromoListView({
  printings,
  onRowClick,
  languageLabelMap,
}: {
  printings: Printing[];
  onRowClick: (printing: Printing) => void;
  languageLabelMap: Map<string, string>;
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
              <TableHead className="w-32">Language</TableHead>
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
                    <TableCell className="truncate">
                      {languageLabelMap.get(printing.language) ?? printing.language}
                    </TableCell>
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
                <div className="text-muted-foreground truncate text-xs">
                  {printing.rarity} · {printing.finish} ·{" "}
                  {languageLabelMap.get(printing.language) ?? printing.language}
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
