import { useNavigate } from "@tanstack/react-router";
import { useImperativeHandle, useState } from "react";

import type { AddedEntry } from "@/components/collection/added-cards-list";
import { Button } from "@/components/ui/button";
import { useCreateAcquisitionSource, useAcquisitionSources } from "@/hooks/use-acquisition-sources";
import { useCollections } from "@/hooks/use-collections";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { cn } from "@/lib/utils";

export interface AddToCollectionFlowHandle {
  getAcquisitionSourceId: () => string | undefined;
}

interface AddToCollectionFlowProps {
  ref: React.Ref<AddToCollectionFlowHandle>;
  collectionId: string;
  addedItems: Map<string, AddedEntry>;
  showingAddedList: boolean;
  onToggleAddedList: () => void;
  onDone?: () => void;
}

export function AddToCollectionFlow({
  ref,
  collectionId,
  addedItems,
  showingAddedList,
  onToggleAddedList,
  onDone,
}: AddToCollectionFlowProps) {
  const { data: collections } = useCollections();
  const collectionName = collections?.find((c) => c.id === collectionId)?.name ?? "Collection";
  const sourcesEnabled = useFeatureEnabled("acquisition-sources");
  const { data: sources } = useAcquisitionSources();
  const navigate = useNavigate();

  const [acquisitionSourceId, setAcquisitionSourceId] = useState("");
  const [creatingSource, setCreatingSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const createSource = useCreateAcquisitionSource();

  const totalAdded = [...addedItems.values()].reduce((sum, entry) => sum + entry.quantity, 0);

  useImperativeHandle(ref, () => ({
    getAcquisitionSourceId: () => acquisitionSourceId || undefined,
  }));

  return (
    <div className="border-primary/30 bg-primary/5 mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border px-2 py-0.5 text-xs sm:gap-3 sm:rounded-lg sm:px-4 sm:py-2 sm:text-sm">
      <span className="font-medium">Adding to: {collectionName}</span>
      {sourcesEnabled && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Source:</span>
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
                      setAcquisitionSourceId(source.id);
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
                className="bg-background h-7 w-40 rounded border px-2"
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
              value={acquisitionSourceId}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setCreatingSource(true);
                  setAcquisitionSourceId("");
                } else {
                  setAcquisitionSourceId(e.target.value);
                }
              }}
              className="bg-background h-7 rounded border px-2"
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
      )}
      <div className="flex-1" />
      {addedItems.size > 0 && (
        <button
          type="button"
          onClick={onToggleAddedList}
          className={cn(
            "rounded-full px-2 py-0.5 font-medium transition-colors sm:px-3 sm:py-1",
            showingAddedList
              ? "bg-primary text-primary-foreground"
              : "bg-primary/10 text-primary hover:bg-primary/20",
          )}
        >
          {totalAdded} {totalAdded === 1 ? "card" : "cards"} added
        </button>
      )}
      <Button
        size="sm"
        onClick={() => {
          if (onDone) {
            onDone();
          } else {
            void navigate({
              to: "/collections/$collectionId",
              params: { collectionId },
            });
          }
        }}
      >
        Done
      </Button>
    </div>
  );
}
