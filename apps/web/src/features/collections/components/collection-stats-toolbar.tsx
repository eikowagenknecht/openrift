import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCollections } from "@/features/collections/hooks/use-collections";
import type { CompletionCountMode, CompletionGroupBy } from "@/features/collections/lib/stat-types";

const GROUP_BY_OPTIONS: { value: CompletionGroupBy; label: string }[] = [
  { value: "set", label: "Set" },
  { value: "domain", label: "Domain" },
  { value: "rarity", label: "Rarity" },
  { value: "type", label: "Type" },
];

const COUNT_MODE_OPTIONS: { value: CompletionCountMode; label: string; tooltip: string }[] = [
  { value: "cards", label: "Cards", tooltip: "One of each unique card" },
  { value: "printings", label: "Printings", tooltip: "Every printing variant" },
  {
    value: "copies",
    label: "Playset",
    tooltip: "Playset quantities (3x, 1x for Legends/Battlefields). Runes and Other are left out.",
  },
];

function CollectionSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { data: collections } = useCollections();

  return (
    <Select
      value={value}
      onValueChange={(newValue) => onChange(newValue ?? "all")}
      items={{
        all: "All collections",
        ...Object.fromEntries(collections?.map((col) => [col.id, col.name]) ?? []),
      }}
    >
      <SelectTrigger className="w-auto" aria-label="Collection scope">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All collections</SelectItem>
        {collections?.map((col) => (
          <SelectItem key={col.id} value={col.id}>
            {col.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CollectionStatsToolbar({
  collectionScope,
  onCollectionScopeChange,
  groupBy,
  onGroupByChange,
  countMode,
  onCountModeChange,
}: {
  collectionScope: string;
  onCollectionScopeChange: (value: string) => void;
  groupBy: CompletionGroupBy;
  onGroupByChange: (value: CompletionGroupBy) => void;
  countMode: CompletionCountMode;
  onCountModeChange: (value: CompletionCountMode) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <CollectionSelector value={collectionScope} onChange={onCollectionScopeChange} />
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <ToggleGroup
          variant="outline"
          spacing={0}
          value={[groupBy]}
          onValueChange={([next]) => {
            const option = GROUP_BY_OPTIONS.find((entry) => entry.value === next);
            if (option) {
              onGroupByChange(option.value);
            }
          }}
          aria-label="Group by"
        >
          {GROUP_BY_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <TooltipProvider>
          <ToggleGroup
            variant="outline"
            spacing={0}
            value={[countMode]}
            onValueChange={([next]) => {
              const option = COUNT_MODE_OPTIONS.find((entry) => entry.value === next);
              if (option) {
                onCountModeChange(option.value);
              }
            }}
            aria-label="Count mode"
          >
            {COUNT_MODE_OPTIONS.map((option) => (
              <Tooltip key={option.value}>
                <TooltipTrigger render={<ToggleGroupItem value={option.value} />}>
                  {option.label}
                </TooltipTrigger>
                <TooltipContent>{option.tooltip}</TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
        </TooltipProvider>
      </div>
    </div>
  );
}
