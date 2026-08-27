import type { Currency, ListIntent, ListKind, TradePreference } from "@openrift/shared";
import { ChevronDownIcon, CopyIcon, SquareIcon, SquareStackIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useState } from "react";

import { TradePreferenceEditor } from "@/components/trade-preferences/trade-preference-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { useFriendGroupsList, useShareListWithFriendGroup } from "@/hooks/use-friend-groups";
import { useBulkAddListEntries, useCreateList } from "@/hooks/use-lists";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

const EMPTY_TRADE_PREFERENCE: TradePreference = {
  pricePref: null,
  priceAbsoluteCents: null,
  tradeType: null,
};

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface KindOption {
  kind: ListKind;
  label: string;
  icon: IconComponent;
}

// Icons mirror the filter-chrome view-mode toggle (apps/web/src/components/
// filters/options-bar.tsx): cards / printings / copies use the same glyphs
// so the visual mapping is consistent across surfaces.
const KIND_OPTIONS: Record<ListKind, KindOption> = {
  card: {
    kind: "card",
    label: "Cards",
    icon: SquareIcon,
  },
  printing: {
    kind: "printing",
    label: "Printings",
    icon: CopyIcon,
  },
  copy: {
    kind: "copy",
    label: "Copies",
    icon: SquareStackIcon,
  },
};

const KIND_HINTS: Record<ListIntent, Record<ListKind, string>> = {
  wish: {
    card: "Any printing works.",
    printing: "A specific version (set, art, finish).",
    copy: "specific physical cards from your collection",
  },
  trade: {
    card: "any printing of the card",
    printing: "a specific printing (set, art, finish)",
    copy: "specific physical cards from your collection",
  },
  organize: {
    card: "Any printing works.",
    printing: "A specific version (set, art, finish).",
    copy: "Specific physical cards from your collection.",
  },
};

const KINDS_BY_INTENT: Record<ListIntent, ListKind[]> = {
  wish: ["card", "printing"],
  trade: ["copy"],
  organize: ["card", "printing", "copy"],
};

const INTENT_TITLE: Record<ListIntent, string> = {
  wish: "New wishlist",
  trade: "New tradelist",
  organize: "New organize list",
};

export interface InitialEntry {
  cardId?: string;
  printingId?: string;
  copyId?: string;
  quantity?: number;
}

interface CreateListDialogProps {
  intent: ListIntent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (listId: string) => void;
  /**
   * Pre-fills the name input. The user can still edit it before submitting.
   */
  defaultName?: string;
  /**
   * If provided, the dialog bulk-adds the returned entries to the new list
   * immediately after creation. Called with the chosen kind so the caller
   * can shape entries per kind (e.g. `cardId` for "card", `printingId` for
   * "printing"). Return an empty array to skip the bulk-add.
   */
  initialEntries?: (kind: ListKind) => InitialEntry[];
  /**
   * Overrides the dialog title. Use when the dialog is opened from a
   * surface where the generic "New wishlist" copy doesn't fit (e.g. a
   * deck's missing-cards view).
   */
  title?: string;
  /**
   * Overrides the dialog body description. Replaces the default copy
   * (including the "learn the difference" help link) entirely.
   */
  description?: string;
  /**
   * Per-kind overrides for the kind-picker hint text. Falls back to the
   * default hints for any kind not present in the map.
   */
  kindHints?: Partial<Record<ListKind, string>>;
}

/**
 * Picks the list's `kind` (when the intent allows more than one) and its
 * name. Trade defaults straight to a name input since `copy` is the only
 * valid kind. The created list's id is passed to onCreated so callers can
 * navigate or chain follow-ups.
 * @returns The dialog component.
 */
export function CreateListDialog({
  intent,
  open,
  onOpenChange,
  onCreated,
  defaultName,
  initialEntries,
  title,
  description,
  kindHints,
}: CreateListDialogProps) {
  const availableKinds = KINDS_BY_INTENT[intent];
  const [kind, setKind] = useState<ListKind>(availableKinds[0] ?? "card");
  const [name, setName] = useState(defaultName ?? "");
  const defaultCurrency = useDisplayStore((s) => s.defaultCurrency);
  const [tradeDefaults, setTradeDefaults] = useState<TradePreference>(EMPTY_TRADE_PREFERENCE);
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  // Tracks groups the user has explicitly opted into. Defaulting to an empty
  // set means a new list starts private — the user checks a group to share it.
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  // Trade preferences are secondary, so the section starts collapsed.
  const [tradePrefsOpen, setTradePrefsOpen] = useState(false);
  const createList = useCreateList();
  const bulkAdd = useBulkAddListEntries();
  const shareWithGroup = useShareListWithFriendGroup();
  // Only fetched while the dialog is open; non-suspending so it never blocks
  // the rest of the dialog from rendering.
  const groups = useFriendGroupsList(open).data?.items ?? [];

  const supportsPrefs = intent !== "organize";
  const absoluteNeedsAmount =
    tradeDefaults.pricePref === "absolute" && tradeDefaults.priceAbsoluteCents === null;

  // Reset state on close so the next open starts fresh.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName(defaultName ?? "");
      setKind(availableKinds[0] ?? "card");
      setTradeDefaults(EMPTY_TRADE_PREFERENCE);
      setCurrency(defaultCurrency);
      setSelectedGroupIds(new Set());
      setTradePrefsOpen(false);
    }
    onOpenChange(next);
  };

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (
      !trimmed ||
      createList.isPending ||
      bulkAdd.isPending ||
      shareWithGroup.isPending ||
      absoluteNeedsAmount
    ) {
      return;
    }
    createList.mutate(
      {
        name: trimmed,
        intent,
        kind,
        // Save currency for every wish/trade list so a later per-entry
        // "fixed price" override has a unit to render. Only the absolute
        // branch actually uses the value, but having it pre-set avoids the
        // "?" the user would otherwise see when toggling to fixed price.
        ...(supportsPrefs && { tradeDefaults, currency }),
      },
      {
        onSuccess: async (list) => {
          const entries = initialEntries?.(kind) ?? [];
          if (entries.length > 0) {
            await bulkAdd.mutateAsync({ listId: list.id, entries });
          }
          // Group visibility is opt-in (ADR-013): the API creates every list
          // private, so we only share it with the groups the user checked. A
          // failure doesn't block creation — visibility can be fixed later from
          // the list's share dialog.
          const selectedGroups = groups.filter((group) => selectedGroupIds.has(group.id));
          await Promise.allSettled(
            selectedGroups.map((group) =>
              shareWithGroup.mutateAsync({ slug: group.slug, listId: list.id }),
            ),
          );
          onCreated?.(list.id);
          handleOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? INTENT_TITLE[intent]}</DialogTitle>
          <DialogDescription>
            {description === undefined
              ? availableKinds.length === 1
                ? "List specific copies you want to sell or trade away."
                : "You can't change it later, but you can always create a new list."
              : description}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <Input
            autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- intentional inside dialog
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="List name"
          />
          {availableKinds.length > 1 && (
            <div className="flex flex-col gap-1">
              {availableKinds.map((option) => {
                const meta = KIND_OPTIONS[option];
                const Icon = meta.icon;
                const isSelected = kind === option;
                return (
                  <Pressable
                    key={option}
                    className={cn(
                      "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted border-transparent",
                    )}
                    onClick={() => setKind(option)}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium">{meta.label}</div>
                      <div className="text-muted-foreground text-xs">
                        {kindHints?.[option] ?? KIND_HINTS[intent][option]}
                      </div>
                    </div>
                  </Pressable>
                );
              })}
            </div>
          )}
          {groups.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Group visibility
              </div>
              <div className="text-muted-foreground text-xs">
                {intent === "organize"
                  ? "Members of the selected groups can view this list."
                  : "Members of the selected groups can view this list and find trades with you."}{" "}
                You can change this later.
              </div>
              <ul className="flex flex-col gap-2">
                {groups.map((group) => {
                  const checkboxId = `create-list-group-${group.id}`;
                  const isSelected = selectedGroupIds.has(group.id);
                  return (
                    <li key={group.id} className="flex items-center gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={isSelected}
                        disabled={createList.isPending || bulkAdd.isPending}
                        onCheckedChange={(checked) => {
                          setSelectedGroupIds((prev) => {
                            const next = new Set(prev);
                            if (checked === false) {
                              next.delete(group.id);
                            } else {
                              next.add(group.id);
                            }
                            return next;
                          });
                        }}
                      />
                      <label htmlFor={checkboxId} className="cursor-pointer text-sm">
                        {group.name}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {supportsPrefs && (
            <Collapsible open={tradePrefsOpen} onOpenChange={setTradePrefsOpen}>
              <CollapsibleTrigger
                type="button"
                className="text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center gap-1.5 text-xs font-medium tracking-wide uppercase"
              >
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 shrink-0 transition-transform",
                    tradePrefsOpen && "rotate-180",
                  )}
                />
                Trade preferences
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-col gap-2 pt-2">
                  <div className="text-muted-foreground text-xs">
                    Defaults applied to every entry. You can override per card later.
                  </div>
                  <TradePreferenceEditor
                    value={tradeDefaults}
                    onChange={setTradeDefaults}
                    currency={currency}
                    showCurrency
                    onCurrencyChange={setCurrency}
                    idPrefix="create-list"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={createList.isPending || bulkAdd.isPending || shareWithGroup.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !name.trim() ||
                createList.isPending ||
                bulkAdd.isPending ||
                shareWithGroup.isPending ||
                absoluteNeedsAmount
              }
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Glyph for a list's kind, for sidebar rows and badges. A record rather than a
 * lookup function so call sites index it: the React Compiler cannot prove a
 * function returns a stable component and treats the result as created during
 * render.
 */
export const LIST_KIND_ICON: Record<ListKind, IconComponent> = {
  card: KIND_OPTIONS.card.icon,
  printing: KIND_OPTIONS.printing.icon,
  copy: KIND_OPTIONS.copy.icon,
};
