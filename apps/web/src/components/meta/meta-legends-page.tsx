import type { MetaLegendSummary } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { Link, getRouteApi } from "@tanstack/react-router";
import { SwordsIcon } from "lucide-react";

import { DomainIcon } from "@/components/deck/domain-icon";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/filters/search-input";
import {
  PageDescription,
  PageTopBar,
  PageTopBarBack,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { META_LEGENDS_DESCRIPTION } from "@/components/meta/meta-copy";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { useMetaLegends } from "@/hooks/use-meta";
import { useSearchUrlSync } from "@/hooks/use-search-url-sync";
import { metaShownLabel, splitLegendName } from "@/lib/meta-format";
import { filterLegends } from "@/lib/meta-legend-page";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const routeApi = getRouteApi("/_app/meta_/legends");

function LegendRow({ entry }: { entry: MetaLegendSummary }) {
  const { champion, title } = splitLegendName(entry.legend.name);
  const placeholder = <span className="bg-muted size-10 shrink-0 rounded-sm" />;

  return (
    <Link
      to="/meta/legends/$slug"
      params={{ slug: entry.slug }}
      className="hover:bg-muted/40 focus-visible:ring-ring/50 flex items-center gap-3 px-4 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset"
    >
      {entry.legend.imageId === null ? (
        placeholder
      ) : (
        <ImgWithFallback
          src={imageUrl(entry.legend.imageId, "120w")}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="ring-foreground/10 size-10 shrink-0 rounded-sm object-cover object-top ring-1 ring-inset"
          fallback={placeholder}
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{champion}</span>
          {entry.legend.domains.map((domain) => (
            <DomainIcon key={domain} domain={domain} className="size-4 shrink-0" />
          ))}
        </p>
        {title !== null && <p className="text-muted-foreground truncate text-xs">{title}</p>}
      </div>

      <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
        {entry.deckCount.toLocaleString("en-US")} {entry.deckCount === 1 ? "decklist" : "decklists"}
      </span>
    </Link>
  );
}

function LegendSearchBox({
  urlValue,
  onCommit,
}: {
  urlValue: string;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useSearchUrlSync({ urlValue, onCommit });
  return (
    <SearchInput
      className="min-w-56 flex-1"
      value={value}
      onValueChange={setValue}
      placeholder="Search legends"
    />
  );
}

/** `/meta/legends` — every legend the archive holds a result for, by name. */
export function MetaLegendsPage() {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { data } = useMetaLegends();

  const commitQuery = (value: string) => {
    void navigate({ search: value === "" ? {} : { q: value }, replace: true });
  };

  const all = data.legends;
  const legends = filterLegends(all, search.q);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarBack to="/meta" aria-label="Meta archive" />
          <PageTopBarTitle>Legends</PageTopBarTitle>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {metaShownLabel(legends.length, all.length, {
              singular: "legend",
              plural: "legends",
            })}
          </span>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "px-safe pt-3 pb-6")}>
        <PageDescription className="pb-4">{META_LEGENDS_DESCRIPTION}</PageDescription>

        {all.length === 0 ? (
          <EmptyState
            className="py-12"
            icon={SwordsIcon}
            title="No legends on record yet"
            description="Legends appear here as soon as an event's standings are archived."
          />
        ) : (
          <>
            <LegendSearchBox urlValue={search.q ?? ""} onCommit={commitQuery} />

            <div className="bg-card ring-foreground/10 mt-4 overflow-hidden rounded-lg ring-1">
              {legends.length === 0 ? (
                <Empty className="py-10">
                  <EmptyHeader>
                    <EmptyDescription>No legend matches that name.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="divide-border flex flex-col divide-y">
                  {legends.map((entry) => (
                    <li key={entry.slug}>
                      <LegendRow entry={entry} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
