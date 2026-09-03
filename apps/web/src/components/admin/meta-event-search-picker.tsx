import { formatDay } from "@openrift/shared";
import type { AdminMetaEvent } from "@openrift/shared";
import { useState } from "react";

import { CatalogSearchCombobox } from "@/components/cards/card-search-dropdown";
import { Badge } from "@/components/ui/badge";
import { useMetaEventSearch } from "@/hooks/use-admin-meta";

function EventRow({ event }: { event: AdminMetaEvent }) {
  return (
    <>
      <span className="min-w-0 flex-1 truncate font-medium">{event.name}</span>
      <span className="text-muted-foreground shrink-0 tabular-nums">
        {formatDay(event.eventDate)}
      </span>
      <Badge variant="outline">{event.format}</Badge>
    </>
  );
}

/** Free-text search over the whole archive, for the event-match panel's search fallback. */
export function MetaEventSearchPicker({
  disabled,
  onPick,
}: {
  disabled?: boolean;
  onPick: (metaEventId: string, name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const { data, isPending } = useMetaEventSearch(query);

  return (
    <CatalogSearchCombobox<AdminMetaEvent>
      results={data?.events ?? []}
      getKey={(event) => event.id}
      renderItem={(event) => <EventRow event={event} />}
      itemToInputValue={(event) => event.name}
      onQueryChange={setQuery}
      onSelect={(event) => {
        onPick(event.id, event.name);
      }}
      placeholder="Search all events…"
      emptyMessage={isPending ? "Searching…" : "No matching events"}
      disabled={disabled}
      className="w-72"
    />
  );
}
