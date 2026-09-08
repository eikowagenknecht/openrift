import { useSuspenseQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Heading } from "@/components/heading";
import { PageToc } from "@/components/layout/page-toc";
import { Input } from "@/components/ui/input";
import { publicSetListQueryOptions } from "@/features/cards/hooks/use-public-sets";
import {
  ArtVariantsSection,
  BoosterPacksSection,
  FinishesSection,
  MarkersSection,
  PrintingDetailsSection,
  RaritiesSection,
} from "@/features/rules/components/glossary-printing-sections";
import { NumberingSection, SetsSection } from "@/features/rules/components/glossary-sets-sections";
import { GroupHeading, TOC_ITEMS } from "@/features/rules/components/glossary-shared";
import {
  CardTypesSection,
  DomainsSection,
  KeywordsSection,
  SymbolsSection,
} from "@/features/rules/components/glossary-vocabulary-sections";
import { KEYWORD_INFO } from "@/features/rules/lib/glossary";
import type { KeywordRow, SetEntry } from "@/features/rules/lib/glossary-content";
import { useMarkerList } from "@/hooks/use-enums";
import { initQueryOptions } from "@/hooks/use-init";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

export function GlossaryPage() {
  const { data: init } = useSuspenseQuery(initQueryOptions);
  const { data: setList } = useSuspenseQuery(publicSetListQueryOptions);
  const markers = useMarkerList();
  const [query, setQuery] = useState("");

  const keywordRows = useMemo<KeywordRow[]>(() => {
    const rows: KeywordRow[] = [];
    const seen = new Set<string>();
    for (const [name, entry] of Object.entries(init.keywords ?? {})) {
      seen.add(name);
      rows.push({
        name,
        color: entry.color,
        darkText: entry.darkText,
        info: KEYWORD_INFO[name],
      });
    }
    for (const name of Object.keys(KEYWORD_INFO)) {
      if (!seen.has(name)) {
        rows.push({ name, info: KEYWORD_INFO[name] });
      }
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [init.keywords]);

  const domains = init.enums.domains ?? [];
  const rarities = init.enums.rarities ?? [];
  const cardTypes = init.enums.cardTypes ?? [];
  const artVariants = init.enums.artVariants ?? [];
  const finishes = init.enums.finishes ?? [];
  const sets: SetEntry[] = (setList.sets ?? []).map((setEntry) => ({
    slug: setEntry.slug,
    name: setEntry.name,
    releases: setEntry.releases,
    setType: setEntry.setType,
    cardCount: setEntry.cardCount,
  }));

  return (
    <div className={cn(PAGE_WIDTH.full, PAGE_PADDING)}>
      <Heading level={1}>Glossary</Heading>
      <p className="text-muted-foreground mt-1">
        The terms, symbols, and printing details on Riftbound cards and across OpenRift. Entries
        link to the comprehensive rules.
      </p>

      <div className="relative mt-4 mb-4 max-w-md">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the glossary..."
          className="pl-9"
        />
      </div>

      <div className="flex gap-6">
        <PageToc items={TOC_ITEMS} />
        <div className="min-w-0 flex-1 space-y-12">
          <section>
            <GroupHeading id="game-vocabulary" title="Game vocabulary" />
            <DomainsSection domains={domains} query={query} />
            <CardTypesSection types={cardTypes} query={query} />
            <KeywordsSection keywords={keywordRows} query={query} />
            <SymbolsSection query={query} />
          </section>
          <section>
            <GroupHeading id="printing-variants" title="Printing variants" />
            <RaritiesSection rarities={rarities} query={query} />
            <BoosterPacksSection query={query} />
            <ArtVariantsSection artVariants={artVariants} query={query} />
            <FinishesSection finishes={finishes} query={query} />
            <MarkersSection markers={markers} query={query} />
            <PrintingDetailsSection query={query} />
          </section>
          <section>
            <GroupHeading id="sets-and-numbering" title="Sets and numbering" />
            <SetsSection sets={sets} query={query} />
            <NumberingSection query={query} />
          </section>
        </div>
      </div>
    </div>
  );
}
