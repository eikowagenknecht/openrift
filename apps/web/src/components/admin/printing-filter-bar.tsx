import type { AdminPrintingResponse } from "@openrift/shared";
import { useState } from "react";

import { LanguageChip } from "@/components/language-chip";
import { Button } from "@/components/ui/button";

export type PrintingMarkerFilter = "all" | "with" | "without";

export interface PrintingFilterBarProps {
  availableLanguages: string[];
  availableSets: [string, string][];
  showMarkerFilter: boolean;
  languageFilter: string | null;
  setFilter: string | null;
  markerFilter: PrintingMarkerFilter;
  onLanguageFilterChange: (language: string | null) => void;
  onSetFilterChange: (setSlug: string | null) => void;
  onMarkerFilterChange: (filter: PrintingMarkerFilter) => void;
}

export function filterPrintings(
  printings: readonly AdminPrintingResponse[],
  filters: { language: string | null; setSlug: string | null; marker: PrintingMarkerFilter },
): AdminPrintingResponse[] {
  return printings.filter((p) => {
    if (filters.setSlug && p.setSlug !== filters.setSlug) {
      return false;
    }
    if (filters.language && p.language !== filters.language) {
      return false;
    }
    if (filters.marker === "with" && p.markerSlugs.length === 0) {
      return false;
    }
    if (filters.marker === "without" && p.markerSlugs.length > 0) {
      return false;
    }
    return true;
  });
}

export function usePrintingFilters(printings: readonly AdminPrintingResponse[]): {
  filteredPrintings: AdminPrintingResponse[];
  filters: PrintingFilterBarProps;
} {
  const [setFilter, setSetFilter] = useState<string | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const [markerFilter, setMarkerFilter] = useState<PrintingMarkerFilter>("all");

  const availableSets = [
    ...new Map(printings.map((p) => [p.setSlug, p.setName ?? p.setSlug])).entries(),
  ];
  const availableLanguages = [...new Set(printings.map((p) => p.language))].toSorted();
  const hasMarkered = printings.some((p) => p.markerSlugs.length > 0);
  const hasMarkerless = printings.some((p) => p.markerSlugs.length === 0);

  return {
    filteredPrintings: filterPrintings(printings, {
      language: languageFilter,
      setSlug: setFilter,
      marker: markerFilter,
    }),
    filters: {
      availableLanguages,
      availableSets,
      showMarkerFilter: hasMarkered && hasMarkerless,
      languageFilter,
      setFilter,
      markerFilter,
      onLanguageFilterChange: setLanguageFilter,
      onSetFilterChange: setSetFilter,
      onMarkerFilterChange: setMarkerFilter,
    },
  };
}

export function PrintingFilterBar({
  availableLanguages,
  availableSets,
  showMarkerFilter,
  languageFilter,
  setFilter,
  markerFilter,
  onLanguageFilterChange,
  onSetFilterChange,
  onMarkerFilterChange,
}: PrintingFilterBarProps) {
  return (
    <>
      {availableLanguages.length > 1 && (
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground mr-1 text-sm">Language</span>
          <Button
            size="sm"
            variant={languageFilter === null ? "default" : "outline"}
            onClick={() => onLanguageFilterChange(null)}
          >
            All
          </Button>
          {availableLanguages.map((lang) => (
            <Button
              key={lang}
              size="sm"
              variant={languageFilter === lang ? "default" : "outline"}
              onClick={() => onLanguageFilterChange(lang)}
            >
              <LanguageChip code={lang} />
            </Button>
          ))}
        </div>
      )}
      {availableSets.length > 1 && (
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground mr-1 text-sm">Set</span>
          <Button
            size="sm"
            variant={setFilter === null ? "default" : "outline"}
            onClick={() => onSetFilterChange(null)}
          >
            All
          </Button>
          {availableSets.map(([slug, name]) => (
            <Button
              key={slug}
              size="sm"
              variant={setFilter === slug ? "default" : "outline"}
              onClick={() => onSetFilterChange(slug)}
            >
              {name}
            </Button>
          ))}
        </div>
      )}
      {showMarkerFilter && (
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground mr-1 text-sm">Markers</span>
          <Button
            size="sm"
            variant={markerFilter === "all" ? "default" : "outline"}
            onClick={() => onMarkerFilterChange("all")}
          >
            All
          </Button>
          <Button
            size="sm"
            variant={markerFilter === "with" ? "default" : "outline"}
            onClick={() => onMarkerFilterChange("with")}
          >
            With
          </Button>
          <Button
            size="sm"
            variant={markerFilter === "without" ? "default" : "outline"}
            onClick={() => onMarkerFilterChange("without")}
          >
            Without
          </Button>
        </div>
      )}
    </>
  );
}
