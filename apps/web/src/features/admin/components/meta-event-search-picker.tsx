import { formatDay } from "@openrift/shared/format-date";
import type { AdminMetaEvent } from "@openrift/shared/types/api/meta";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { useMetaEventSearch } from "@/features/admin/hooks/use-admin-meta";
import { CatalogSearchCombobox } from "@/features/cards/components/card-search-dropdown";

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
