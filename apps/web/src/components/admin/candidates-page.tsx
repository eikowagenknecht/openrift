import type { CandidateCard } from "@openrift/shared";
import { useState } from "react";

import { CandidateCardRow } from "@/components/admin/candidate-card-row";
import { CandidateDiffRow } from "@/components/admin/candidate-diff-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcceptCandidate,
  useBatchAcceptCandidates,
  useCandidates,
  useCreateAlias,
  useEditCandidate,
  useRejectCandidate,
} from "@/hooks/use-candidates";

export function CandidatesPage() {
  const { data: newCandidates, isLoading: newLoading } = useCandidates("new");
  const { data: updateCandidates, isLoading: updatesLoading } = useCandidates("updates");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const acceptMutation = useAcceptCandidate();
  const rejectMutation = useRejectCandidate();
  const batchAcceptMutation = useBatchAcceptCandidates();
  const editMutation = useEditCandidate();
  const aliasMutation = useCreateAlias();

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (!newCandidates) {
      return;
    }
    if (selected.size === newCandidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(newCandidates.map((c) => c.id)));
    }
  }

  function handleBatchAccept() {
    const ids = [...selected];
    if (ids.length === 0) {
      return;
    }
    batchAcceptMutation.mutate(ids, {
      onSuccess: () => setSelected(new Set()),
    });
  }

  if (newLoading || updatesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const newCards = newCandidates ?? [];
  const updates = updateCandidates ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">New Cards</h2>
            {newCards.length > 0 && <Badge variant="secondary">{newCards.length}</Badge>}
          </div>
          {selected.size > 0 && (
            <Button size="sm" disabled={batchAcceptMutation.isPending} onClick={handleBatchAccept}>
              Accept {selected.size} selected
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Accepting a new card adds it to the catalog with its printings. Rejecting discards it.
        </p>
        {newCards.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No new candidates pending.
          </p>
        ) : (
          <NewCardsSection
            candidates={newCards}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onAccept={(id) => acceptMutation.mutate({ id })}
            onReject={(id) => rejectMutation.mutate(id)}
            onEdit={(id, fields) => editMutation.mutate({ id, fields })}
            acceptPending={acceptMutation.isPending}
            rejectPending={rejectMutation.isPending}
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Updates</h2>
          {updates.length > 0 && <Badge variant="secondary">{updates.length}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          Accepting an update applies the selected fields to the existing card. Rejecting keeps the
          current data.
        </p>
        {updates.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No update candidates pending.
          </p>
        ) : (
          <div className="space-y-2">
            {updates.map((candidate) => (
              <CandidateDiffRow
                key={candidate.id}
                candidate={candidate}
                onAccept={(fields) =>
                  acceptMutation.mutate({ id: candidate.id, acceptedFields: fields })
                }
                onReject={() => rejectMutation.mutate(candidate.id)}
                onCreateAlias={(cardId) =>
                  aliasMutation.mutate({ candidateId: candidate.id, cardId })
                }
                acceptPending={acceptMutation.isPending}
                rejectPending={rejectMutation.isPending}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NewCardsSection({
  candidates,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onAccept,
  onReject,
  onEdit,
  acceptPending,
  rejectPending,
}: {
  candidates: CandidateCard[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (id: string, fields: Record<string, unknown>) => void;
  acceptPending: boolean;
  rejectPending: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          type="button"
          className="text-xs underline underline-offset-2"
          onClick={onToggleSelectAll}
        >
          {selected.size === candidates.length ? "Deselect all" : "Select all"}
        </button>
      </div>
      {candidates.map((candidate) => (
        <CandidateCardRow
          key={candidate.id}
          candidate={candidate}
          isSelected={selected.has(candidate.id)}
          onToggleSelect={() => onToggleSelect(candidate.id)}
          onAccept={() => onAccept(candidate.id)}
          onReject={() => onReject(candidate.id)}
          onEdit={(fields) => onEdit(candidate.id, fields)}
          acceptPending={acceptPending}
          rejectPending={rejectPending}
        />
      ))}
    </div>
  );
}
