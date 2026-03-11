import type { Printing } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AddCardPopover } from "@/components/collection/add-card-popover";
import { Button } from "@/components/ui/button";
import { useCollections } from "@/hooks/use-collections";
import { useCreateSource, useSources } from "@/hooks/use-sources";

export interface AddToCollectionFlowHandle {
  handleAddClick: (printing: Printing, anchorEl: HTMLElement) => void;
}

interface AddToCollectionFlowProps {
  ref: React.Ref<AddToCollectionFlowHandle>;
  collectionId: string;
  printingsByCardId: Map<string, Printing[]>;
}

export function AddToCollectionFlow({
  ref,
  collectionId,
  printingsByCardId,
}: AddToCollectionFlowProps) {
  const { data: collections } = useCollections();
  const collectionName = collections?.find((c) => c.id === collectionId)?.name ?? "Collection";
  const { data: sources } = useSources();
  const navigate = useNavigate();

  const [sourceId, setSourceId] = useState("");
  const [creatingSource, setCreatingSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const createSource = useCreateSource();

  const [popoverCard, setPopoverCard] = useState<Printing | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverCard) {
      return;
    }
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverCard(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popoverCard]);

  const handleAddClick = (printing: Printing, anchorEl: HTMLElement) => {
    const rect = anchorEl.getBoundingClientRect();
    setPopoverPos({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, globalThis.innerWidth - 240)),
    });
    setPopoverCard(printing);
  };

  useImperativeHandle(ref, () => ({ handleAddClick }));

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
        <span className="text-sm font-medium">Adding to: {collectionName}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Source:</span>
          {creatingSource ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = newSourceName.trim();
                if (!trimmed) {
                  return;
                }
                createSource.mutate(
                  { name: trimmed },
                  {
                    onSuccess: (source) => {
                      setSourceId(source.id);
                      setCreatingSource(false);
                      setNewSourceName("");
                    },
                  },
                );
              }}
            >
              <input
                type="text"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                placeholder="e.g. Local Game Store"
                className="h-7 w-40 rounded border bg-background px-2 text-xs"
                autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- intentional for inline create
                onBlur={() => {
                  if (!newSourceName.trim()) {
                    setCreatingSource(false);
                  }
                }}
              />
              <Button type="submit" size="sm" variant="secondary" disabled={createSource.isPending}>
                Add
              </Button>
            </form>
          ) : (
            <select
              value={sourceId}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setCreatingSource(true);
                  setSourceId("");
                } else {
                  setSourceId(e.target.value);
                }
              }}
              className="h-7 rounded border bg-background px-2 text-xs"
            >
              <option value="">None</option>
              {sources?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__new__">+ Create new…</option>
            </select>
          )}
        </div>
        <div className="flex-1" />
        <Button
          size="sm"
          onClick={() =>
            void navigate({
              to: "/collections/$collectionId",
              params: { collectionId },
            })
          }
        >
          Done
        </Button>
      </div>

      {/* Add card popover (portal) */}
      {popoverCard &&
        popoverPos &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-[100]"
            style={{ top: popoverPos.top, left: popoverPos.left }}
          >
            <AddCardPopover
              printing={popoverCard}
              printings={printingsByCardId.get(popoverCard.card.id)}
              collectionId={collectionId}
              sourceId={sourceId || undefined}
              onDone={() => setPopoverCard(null)}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
