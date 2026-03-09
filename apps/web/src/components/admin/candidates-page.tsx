import type { CandidateCard } from "@openrift/shared";
import { useState } from "react";

import { CandidateCardRow } from "@/components/admin/candidate-card-row";
import { CandidateDiffRow } from "@/components/admin/candidate-diff-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAcceptCandidate,
  useBatchAcceptCandidates,
  useCandidates,
  useCreateAlias,
  useEditCandidate,
  useRejectCandidate,
} from "@/hooks/use-candidates";

export function CandidatesPage() {
  const [tab, setTab] = useState<"new" | "updates">("new");
  const { data: candidates, isLoading } = useCandidates(tab);
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
    if (!candidates) {
      return;
    }
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map((c) => c.id)));
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as "new" | "updates");
          setSelected(new Set());
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="new">
              New Cards
              {tab === "new" && candidates && (
                <Badge variant="secondary" className="ml-1.5">
                  {candidates.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="updates">
              Updates
              {tab === "updates" && candidates && (
                <Badge variant="secondary" className="ml-1.5">
                  {candidates.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {tab === "new" && selected.size > 0 && (
            <Button size="sm" disabled={batchAcceptMutation.isPending} onClick={handleBatchAccept}>
              Accept {selected.size} selected
            </Button>
          )}
        </div>

        <TabsContent value="new" className="mt-4">
          <NewCardsTab
            candidates={candidates ?? []}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onAccept={(id) => acceptMutation.mutate({ id })}
            onReject={(id) => rejectMutation.mutate(id)}
            onEdit={(id, fields) => editMutation.mutate({ id, fields })}
            acceptPending={acceptMutation.isPending}
            rejectPending={rejectMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="updates" className="mt-4">
          <UpdatesTab
            candidates={candidates ?? []}
            onAccept={(id, acceptedFields) => acceptMutation.mutate({ id, acceptedFields })}
            onReject={(id) => rejectMutation.mutate(id)}
            onCreateAlias={(candidateId, cardId) => aliasMutation.mutate({ candidateId, cardId })}
            acceptPending={acceptMutation.isPending}
            rejectPending={rejectMutation.isPending}
          />
        </TabsContent>
      </Tabs>

      {candidates && candidates.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No {tab === "new" ? "new" : "update"} candidates pending.
        </p>
      )}
    </div>
  );
}

function NewCardsTab({
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
  if (candidates.length === 0) {
    return null;
  }

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

function UpdatesTab({
  candidates,
  onAccept,
  onReject,
  onCreateAlias,
  acceptPending,
  rejectPending,
}: {
  candidates: CandidateCard[];
  onAccept: (id: string, acceptedFields: string[]) => void;
  onReject: (id: string) => void;
  onCreateAlias: (candidateId: string, cardId: string) => void;
  acceptPending: boolean;
  rejectPending: boolean;
}) {
  if (candidates.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {candidates.map((candidate) => (
        <CandidateDiffRow
          key={candidate.id}
          candidate={candidate}
          onAccept={(fields) => onAccept(candidate.id, fields)}
          onReject={() => onReject(candidate.id)}
          onCreateAlias={(cardId) => onCreateAlias(candidate.id, cardId)}
          acceptPending={acceptPending}
          rejectPending={rejectPending}
        />
      ))}
    </div>
  );
}
