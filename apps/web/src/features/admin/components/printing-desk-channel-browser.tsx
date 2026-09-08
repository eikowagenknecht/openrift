import type { DistributionChannelResponse } from "@openrift/shared/types/api/admin";
import type { DistributionChannelKind } from "@openrift/shared/types/catalog";
import { CheckIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
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
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Input } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import {
  buildChannelBrowseRows,
  filterChannelBrowseRows,
} from "@/features/admin/lib/channel-browse";

const KIND_LABEL: Record<DistributionChannelKind, string> = {
  event: "Event",
  product: "Product",
};

function indentStyle(depth: number) {
  return { paddingInlineStart: `${0.75 + depth * 1.25}rem` };
}

export function PrintingDeskChannelBrowser({
  channels,
  selected,
  onSelect,
}: {
  channels: readonly DistributionChannelResponse[];
  selected: readonly string[];
  onSelect: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);

  const filtering = query.trim().length > 0;
  const rows = filterChannelBrowseRows(buildChannelBrowseRows(channels), query);
  const visible = rows.filter(
    (row) => filtering || row.depth === 0 || !collapsed.includes(row.rootId),
  );

  function pick(slug: string) {
    setOpen(false);
    onSelect(slug);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
        }
      }}
    >
      <DialogTrigger render={<Button variant="ghost" />}>Browse all</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Events and products</DialogTitle>
          <DialogDescription>
            Everything promos have been handed out at so far. Pick the one this printing came from.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by name…"
          aria-label="Filter events and products"
        />

        <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
          {visible.map((row) => {
            const style = indentStyle(row.depth);
            const hint = row.channel.childrenLabel;

            if (row.isLeaf) {
              const isSelected = selected.includes(row.channel.slug);
              return (
                <Pressable
                  key={row.channel.id}
                  aria-pressed={isSelected}
                  onClick={() => pick(row.channel.slug)}
                  style={style}
                  className="hover:bg-muted/50 flex w-full items-center gap-2 py-2 pr-3 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{row.channel.label}</span>
                  {row.depth === 0 && (
                    <Badge variant="outline">{KIND_LABEL[row.channel.kind]}</Badge>
                  )}
                  {isSelected && <CheckIcon className="text-primary size-4 shrink-0" />}
                </Pressable>
              );
            }

            if (row.depth === 0) {
              return (
                <ExpandToggle
                  key={row.channel.id}
                  expanded={filtering || !collapsed.includes(row.channel.id)}
                  onClick={() =>
                    setCollapsed((prev) =>
                      prev.includes(row.channel.id)
                        ? prev.filter((id) => id !== row.channel.id)
                        : [...prev, row.channel.id],
                    )
                  }
                  style={style}
                  className="hover:bg-muted/50 w-full py-2 pr-3 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{row.channel.label}</span>
                  {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
                  <Badge variant="outline">{KIND_LABEL[row.channel.kind]}</Badge>
                </ExpandToggle>
              );
            }

            return (
              <div
                key={row.channel.id}
                style={style}
                className="flex items-center gap-2 py-2 pr-3 text-sm font-medium"
              >
                <span className="min-w-0 flex-1 truncate">{row.channel.label}</span>
                {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
              </div>
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
