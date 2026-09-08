import type { DistributionChannelResponse } from "@openrift/shared/types/api/admin";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PrintingDeskChannelBrowser } from "@/features/admin/components/printing-desk-channel-browser";
import type { ChannelSearchOption } from "@/features/admin/lib/channel-picker-search";
import { searchChannelOptions } from "@/features/admin/lib/channel-picker-search";
import { slugifyLabel, suggestChannelSlug } from "@/features/admin/lib/channel-slug-suggest";
import { buildChannelTree, leafChannels } from "@/features/cards/lib/distribution-channel-tree";
import {
  useCreateDistributionChannel,
  useDistributionChannels,
} from "@/hooks/use-distribution-channels";

type Channel = DistributionChannelResponse;

function channelSearchOptions(channels: readonly Channel[]): ChannelSearchOption[] {
  const tree = buildChannelTree([...channels]);
  return leafChannels(tree).map((node) => ({
    id: node.channel.id,
    slug: node.channel.slug,
    label: node.channel.label,
    breadcrumb: node.breadcrumb,
    parentId: node.channel.parentId,
  }));
}

export function PrintingDeskChannelPicker({
  value,
  onChange,
}: {
  value: readonly string[];
  onChange: (slugs: string[]) => void;
}) {
  const { data } = useDistributionChannels();
  const channels = data.distributionChannels;
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<"leaf" | "root" | null>(null);

  const options = channelSearchOptions(channels);
  const bySlug = new Map(options.map((option) => [option.slug, option]));
  const results = searchChannelOptions(options, query).filter(
    (option) => !value.includes(option.slug),
  );
  const parents = channels.filter((channel) => channel.childrenLabel !== null);
  const suggestedParentId = results.at(0)?.parentId ?? parents.at(0)?.id ?? null;

  function add(slug: string) {
    setQuery("");
    setCreating(null);
    if (!value.includes(slug)) {
      onChange([...value, slug]);
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor="desk-channel-search">Where does it come from</FieldLabel>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((slug) => (
            <Badge key={slug} variant="secondary">
              {bySlug.get(slug)?.breadcrumb ?? slug}
              <ChipRemoveButton
                aria-label={`Remove ${bySlug.get(slug)?.label ?? slug}`}
                onClick={() => onChange(value.filter((entry) => entry !== slug))}
              />
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
          <Input
            id="desk-channel-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events and products…"
            className="pl-8"
          />
        </div>
        <PrintingDeskChannelBrowser channels={channels} selected={value} onSelect={add} />
      </div>

      {(query.length > 0 || creating !== null) && (
        <div className="rounded-lg border">
          {results.map((option) => (
            <Pressable
              key={option.id}
              onClick={() => add(option.slug)}
              className="hover:bg-muted/50 flex w-full items-baseline justify-between gap-2 px-3 py-2"
            >
              <span className="truncate text-sm">{option.breadcrumb}</span>
              <span className="text-muted-foreground shrink-0 font-mono text-xs">
                {option.slug}
              </span>
            </Pressable>
          ))}

          {creating === null && (
            <div className="border-t">
              {query.trim().length > 0 && suggestedParentId !== null && (
                <Pressable
                  onClick={() => setCreating("leaf")}
                  className="text-primary hover:bg-muted/50 flex w-full items-center gap-1.5 px-3 py-2 text-sm"
                >
                  <PlusIcon className="size-3.5" />
                  Add “{query.trim()}” under{" "}
                  {channels.find((channel) => channel.id === suggestedParentId)?.label ??
                    "a series"}
                </Pressable>
              )}
              <Pressable
                onClick={() => setCreating("root")}
                className="text-primary hover:bg-muted/50 flex w-full items-center gap-1.5 px-3 py-2 text-sm"
              >
                <PlusIcon className="size-3.5" />
                Add a new series or product
              </Pressable>
            </div>
          )}

          {creating === "leaf" && suggestedParentId !== null && (
            <NewLeafForm
              channels={channels}
              parents={parents}
              initialParentId={suggestedParentId}
              initialLabel={query.trim()}
              onCancel={() => setCreating(null)}
              onCreated={add}
            />
          )}

          {creating === "root" && (
            <NewRootForm
              initialLabel={query.trim()}
              onCancel={() => setCreating(null)}
              onCreated={add}
            />
          )}
        </div>
      )}

      <FieldDescription>
        Pick the event or product the promo was handed out at. Add one if it is missing.
      </FieldDescription>
    </Field>
  );
}

function NewLeafForm({
  channels,
  parents,
  initialParentId,
  initialLabel,
  onCancel,
  onCreated,
}: {
  channels: readonly Channel[];
  parents: readonly Channel[];
  initialParentId: string;
  initialLabel: string;
  onCancel: () => void;
  onCreated: (slug: string) => void;
}) {
  const createChannel = useCreateDistributionChannel();
  const [parentId, setParentId] = useState(initialParentId);
  const [label, setLabel] = useState(initialLabel);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");

  const parent = channels.find((channel) => channel.id === parentId);
  const siblingSlugs = channels
    .filter((channel) => channel.parentId === parentId)
    .map((channel) => channel.slug);
  const suggested = suggestChannelSlug({
    parentSlug: parent?.slug ?? "",
    siblingSlugs,
    label,
  });
  const effectiveSlug = slugTouched ? slug : suggested;
  const canSubmit = label.trim().length > 0 && effectiveSlug.length > 0 && !createChannel.isPending;

  async function submit() {
    if (!canSubmit || !parent) {
      return;
    }
    const created = await createChannel.mutateAsync({
      slug: effectiveSlug,
      label: label.trim(),
      kind: parent.kind,
      parentId,
    });
    onCreated(created.slug);
  }

  return (
    <div className="space-y-3 border-t p-3">
      <Field>
        <FieldLabel htmlFor="desk-channel-parent">Part of</FieldLabel>
        <Select
          items={parents.map((channel) => ({ value: channel.id, label: channel.label }))}
          value={parentId}
          onValueChange={(next) => {
            if (next !== null) {
              setParentId(next);
            }
          }}
        >
          <SelectTrigger id="desk-channel-parent" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {parents.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                {channel.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {parent?.childrenLabel && <FieldDescription>{parent.childrenLabel}</FieldDescription>}
      </Field>

      <Field>
        <FieldLabel htmlFor="desk-channel-label">Name</FieldLabel>
        <Input
          id="desk-channel-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="October 2026"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="desk-channel-slug">Short name</FieldLabel>
        <Input
          id="desk-channel-slug"
          value={effectiveSlug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
        />
        <FieldDescription>
          Suggested from the ones already there. Change it if it looks off.
        </FieldDescription>
      </Field>

      <div className="flex gap-2">
        <Button size="sm" disabled={!canSubmit} onClick={() => void submit()}>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

const KIND_OPTIONS = [
  { value: "event", label: "Event" },
  { value: "product", label: "Product" },
] as const;

function NewRootForm({
  initialLabel,
  onCancel,
  onCreated,
}: {
  initialLabel: string;
  onCancel: () => void;
  onCreated: (slug: string) => void;
}) {
  const createChannel = useCreateDistributionChannel();
  const [label, setLabel] = useState(initialLabel);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<"event" | "product">("event");
  const [childrenLabel, setChildrenLabel] = useState("");

  const effectiveSlug = slugTouched ? slug : slugifyLabel(label);
  const canSubmit = label.trim().length > 0 && effectiveSlug.length > 0 && !createChannel.isPending;

  async function submit() {
    if (!canSubmit) {
      return;
    }
    const created = await createChannel.mutateAsync({
      slug: effectiveSlug,
      label: label.trim(),
      kind,
      parentId: null,
      childrenLabel: childrenLabel.trim().length > 0 ? childrenLabel.trim() : null,
    });
    onCreated(created.slug);
  }

  return (
    <div className="space-y-3 border-t p-3">
      <Field>
        <FieldLabel htmlFor="desk-root-label">Name</FieldLabel>
        <Input
          id="desk-root-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Nexus Night"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="desk-root-slug">Short name</FieldLabel>
        <Input
          id="desk-root-slug"
          value={effectiveSlug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="desk-root-kind">Event or product</FieldLabel>
        <Select
          items={KIND_OPTIONS}
          value={kind}
          onValueChange={(next) => {
            if (next !== null) {
              setKind(next);
            }
          }}
        >
          <SelectTrigger id="desk-root-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="desk-root-children">What its entries are called</FieldLabel>
        <Input
          id="desk-root-children"
          value={childrenLabel}
          onChange={(event) => setChildrenLabel(event.target.value)}
          placeholder="Month"
        />
        <FieldDescription>
          Only needed if this one has entries under it, like a month or a stop.
        </FieldDescription>
      </Field>

      <div className="flex gap-2">
        <Button size="sm" disabled={!canSubmit} onClick={() => void submit()}>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
