import type { ListIntent, ListKind } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CopyIcon, SquareIcon, SquareStackIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreateList } from "@/hooks/use-lists";

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
    card: "Any printing works. Use for the missing cards of a deck you want to play.",
    printing:
      "A specific version (set, art, finish). Use when you want a particular printing, like a foil alt-art from a specific set.",
    copy: "specific physical cards from your collection",
  },
  trade: {
    card: "any printing of the card",
    printing: "a specific printing (set, art, finish)",
    copy: "specific physical cards from your collection",
  },
  organize: {
    card: "Any printing works. Use to group cards however you like, such as a brew pool for a deck idea or a custom-format card list.",
    printing:
      "A specific version (set, art, finish). Use for showcases or themed groupings, like your favorite alt-arts.",
    copy: "Specific physical cards from your collection. Use for a playset earmarked for a specific event, or copies you're undecided about selling and want to keep tabs on.",
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

interface CreateListDialogProps {
  intent: ListIntent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (listId: string) => void;
}

/**
 * Picks the list's `kind` (when the intent allows more than one) and its
 * name. Trade defaults straight to a name input since `copy` is the only
 * valid kind. The created list's id is passed to onCreated so callers can
 * navigate or chain follow-ups.
 * @returns The dialog component.
 */
export function CreateListDialog({ intent, open, onOpenChange, onCreated }: CreateListDialogProps) {
  const availableKinds = KINDS_BY_INTENT[intent];
  const [kind, setKind] = useState<ListKind>(availableKinds[0] ?? "card");
  const [name, setName] = useState("");
  const createList = useCreateList();

  // Reset state on close so the next open starts fresh.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName("");
      setKind(availableKinds[0] ?? "card");
    }
    onOpenChange(next);
  };

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed || createList.isPending) {
      return;
    }
    createList.mutate(
      { name: trimmed, intent, kind },
      {
        onSuccess: (list) => {
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
          <DialogTitle>{INTENT_TITLE[intent]}</DialogTitle>
          <DialogDescription>
            {availableKinds.length === 1
              ? "List specific copies you want to sell or trade away. For example all the bulk after opening one too many Booster Display."
              : "Pick what this list tracks. You can't change it later, but you can always create a new list."}{" "}
            <Link
              to="/help/$slug"
              params={{ slug: "cards-printings-copies" }}
              className="text-primary hover:underline"
            >
              Learn the difference between cards, printings, and copies.
            </Link>
          </DialogDescription>
        </DialogHeader>

        {availableKinds.length > 1 && (
          <div className="flex flex-col gap-1">
            {availableKinds.map((option) => {
              const meta = KIND_OPTIONS[option];
              const Icon = meta.icon;
              const isSelected = kind === option;
              return (
                <button
                  key={option}
                  type="button"
                  className={
                    isSelected
                      ? "border-primary bg-primary/5 flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm"
                      : "hover:bg-muted flex items-start gap-2 rounded-md border border-transparent px-3 py-2 text-left text-sm"
                  }
                  onClick={() => setKind(option)}
                >
                  <Icon className="mt-0.5 size-4 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">{meta.label}</div>
                    <div className="text-muted-foreground text-xs">
                      {KIND_HINTS[intent][option]}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <form
          className="flex flex-col gap-2"
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
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={createList.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || createList.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Compact preview of a list's kind for sidebar rows and badges.
 * @returns The {icon, label} pair for a given kind.
 */
export function listKindIcon(kind: ListKind): IconComponent {
  return KIND_OPTIONS[kind].icon;
}

/**
 * @returns Human label for a list kind ("Cards" | "Printings" | "Copies").
 */
export function listKindLabel(kind: ListKind): string {
  return KIND_OPTIONS[kind].label;
}

const INTENT_LABEL: Record<ListIntent, string> = {
  wish: "Wishlist",
  trade: "Tradelist",
  organize: "Organize",
};

/** @returns Capitalized label for a list intent ("Wishlist" | "Tradelist" | "Organize"). */
export function listIntentLabel(intent: ListIntent): string {
  return INTENT_LABEL[intent];
}
