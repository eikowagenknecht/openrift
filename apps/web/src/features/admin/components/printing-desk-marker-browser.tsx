import type { MarkerResponse } from "@openrift/shared/types/api/admin";
import { CheckIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { cn } from "@/lib/utils";

export function PrintingDeskMarkerBrowser({
  markers,
  selected,
  onToggle,
}: {
  markers: readonly MarkerResponse[];
  selected: readonly string[];
  onToggle: (slug: string) => void;
}) {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const visible = markers.filter(
    (marker) =>
      needle.length === 0 ||
      marker.label.toLowerCase().includes(needle) ||
      marker.slug.includes(needle),
  );

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          setQuery("");
        }
      }}
    >
      <DialogTrigger render={<Button variant="ghost" />}>Browse all</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Markers</DialogTitle>
          <DialogDescription>
            Everything a card can carry. Tap the ones this printing shows.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by name…"
          aria-label="Filter markers"
        />

        <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
          {visible.map((marker) => {
            const isSelected = selected.includes(marker.slug);
            return (
              <Pressable
                key={marker.id}
                aria-pressed={isSelected}
                onClick={() => onToggle(marker.slug)}
                className="hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{marker.label}</span>
                <span className="text-muted-foreground shrink-0 font-mono text-xs">
                  {marker.slug}
                </span>
                <CheckIcon
                  className={cn("size-4 shrink-0", isSelected ? "text-primary" : "invisible")}
                />
              </Pressable>
            );
          })}

          {visible.length === 0 && (
            <Empty>
              <EmptyDescription>Nothing here matches that.</EmptyDescription>
            </Empty>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
