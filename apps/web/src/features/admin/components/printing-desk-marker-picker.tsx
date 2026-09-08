import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { PrintingDeskMarkerBrowser } from "@/features/admin/components/printing-desk-marker-browser";
import { slugifyLabel } from "@/features/admin/lib/channel-slug-suggest";
import { useCreateMarker, useMarkers } from "@/hooks/use-markers";

export function PrintingDeskMarkerPicker({
  value,
  onChange,
}: {
  value: readonly string[];
  onChange: (slugs: string[]) => void;
}) {
  const { data } = useMarkers();
  const createMarker = useCreateMarker();
  const [query, setQuery] = useState("");

  const labelBySlug = new Map(data.markers.map((marker) => [marker.slug, marker.label]));
  const needle = query.trim().toLowerCase();
  const results = data.markers.filter(
    (marker) =>
      !value.includes(marker.slug) &&
      (needle.length === 0 ||
        marker.label.toLowerCase().includes(needle) ||
        marker.slug.includes(needle)),
  );
  const exists = data.markers.some(
    (marker) => marker.label.toLowerCase() === needle || marker.slug === slugifyLabel(query),
  );

  function add(slug: string) {
    setQuery("");
    if (!value.includes(slug)) {
      onChange([...value, slug]);
    }
  }

  function toggle(slug: string) {
    if (value.includes(slug)) {
      onChange(value.filter((entry) => entry !== slug));
      return;
    }
    onChange([...value, slug]);
  }

  async function createAndAdd() {
    const slug = slugifyLabel(query);
    if (slug.length === 0) {
      return;
    }
    await createMarker.mutateAsync({ slug, label: query.trim() });
    add(slug);
  }

  return (
    <Field>
      <FieldLabel htmlFor="desk-marker-search">Printed on the card</FieldLabel>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((slug) => (
            <Badge key={slug} variant="secondary">
              {labelBySlug.get(slug) ?? slug}
              <ChipRemoveButton
                aria-label={`Remove ${labelBySlug.get(slug) ?? slug}`}
                onClick={() => onChange(value.filter((entry) => entry !== slug))}
              />
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          id="desk-marker-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Stamp, signature, promo mark…"
          className="min-w-0 flex-1"
        />
        <PrintingDeskMarkerBrowser markers={data.markers} selected={value} onToggle={toggle} />
      </div>

      {query.length > 0 && (
        <div className="rounded-lg border">
          {results.map((marker) => (
            <Pressable
              key={marker.id}
              onClick={() => add(marker.slug)}
              className="hover:bg-muted/50 flex w-full items-baseline justify-between gap-2 px-3 py-2"
            >
              <span className="truncate text-sm">{marker.label}</span>
              <span className="text-muted-foreground shrink-0 font-mono text-xs">
                {marker.slug}
              </span>
            </Pressable>
          ))}
          {!exists && needle.length > 0 && (
            <Pressable
              onClick={() => void createAndAdd()}
              disabled={createMarker.isPending}
              className="text-primary hover:bg-muted/50 flex w-full items-center gap-1.5 border-t px-3 py-2 text-sm"
            >
              <PlusIcon className="size-3.5" />
              Add “{query.trim()}”
            </Pressable>
          )}
        </div>
      )}

      <FieldDescription>
        What the card itself shows: a stamp, a signature, a promo mark.
      </FieldDescription>
    </Field>
  );
}
