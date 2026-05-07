import type { DistributionChannel } from "@openrift/shared";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildChannelBreadcrumbs } from "@/lib/channel-breadcrumbs";
import { cn } from "@/lib/utils";

interface ChannelComboboxProps {
  channels: readonly DistributionChannel[];
  /** Selected channel slugs. */
  selected: string[];
  onToggle: (slug: string) => void;
  /** Optional label override (defaults to "Channels"). */
  label?: string;
}

/**
 * Multi-select combobox for distribution channels. Renders a button that
 * opens a popover with a search input and a checkable list. Each row shows
 * the full breadcrumb path so visually-identical leaves (multiple "Top 8")
 * stay disambiguated.
 *
 * @returns The combobox trigger + popover.
 */
export function ChannelCombobox({
  channels,
  selected,
  onToggle,
  label = "Channels",
}: ChannelComboboxProps) {
  const [open, setOpen] = useState(false);
  const breadcrumbsById = buildChannelBreadcrumbs(channels);
  const selectedSet = new Set(selected);
  const triggerLabel = selected.length > 0 ? `${label} (${selected.length})` : label;

  const hasSelection = selected.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Badge
            variant={hasSelection ? "default" : "outline"}
            className="cursor-pointer"
            render={<button type="button" />}
          >
            {triggerLabel}
            <ChevronDownIcon className="opacity-60" />
          </Badge>
        }
      />
      <PopoverContent align="start" className="w-96 max-w-[90vw] p-0">
        <Command>
          <CommandInput placeholder="Search channels…" />
          <CommandList>
            <CommandEmpty>No channels match.</CommandEmpty>
            {channels.map((channel) => {
              const path = breadcrumbsById.get(channel.id) ?? channel.label;
              const isSelected = selectedSet.has(channel.slug);
              return (
                <CommandItem
                  key={channel.id}
                  // cmdk filters by `value`; the breadcrumb is what users
                  // expect to type, so use it as the filter target.
                  value={path}
                  data-checked={isSelected}
                  onSelect={() => onToggle(channel.slug)}
                  className={cn("cursor-pointer", isSelected && "font-medium")}
                >
                  <span className="truncate">{path}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
