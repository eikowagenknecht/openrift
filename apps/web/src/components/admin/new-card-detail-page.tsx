import type {
  CandidateCardResponse,
  CandidatePrintingResponse,
  UnmatchedCardDetailResponse,
} from "@openrift/shared";
import { USER_SUBMISSION_PROVIDER } from "@openrift/shared/contracts/card-submissions";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  BanIcon,
  CopyCheckIcon,
  EllipsisVerticalIcon,
  LinkIcon,
  MessageSquareIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CandidateSpreadsheet } from "@/components/admin/candidate-spreadsheet";
import type { FieldDef, NewCardFieldKey } from "@/components/admin/candidate-spreadsheet";
import {
  buildPreseededActiveCard,
  buildPrintingGroups,
  buildSourceLabels,
  useCardDetailData,
} from "@/components/admin/card-detail-shared";
import { GroupImagePreview } from "@/components/admin/image-preview";
import { SubmissionResolutionDialog } from "@/components/admin/submission-resolution-dialog";
import { CardSearchDropdown } from "@/components/cards/card-search-dropdown";
import { Heading } from "@/components/heading";
import {
  SectionHeader,
  SectionHeaderDescription,
  SectionHeaderGroup,
  SectionHeaderTitle,
} from "@/components/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAccess } from "@/hooks/use-admin";
import type {
  AcceptNewCardBody,
  PatchCandidatePrintingBody,
} from "@/hooks/use-admin-card-mutations";
import {
  useAcceptNewCard,
  useLinkCard,
  useReassignCandidatePrinting,
} from "@/hooks/use-admin-card-mutations";
import { useAllCards, useUnmatchedCardDetail } from "@/hooks/use-admin-card-queries";
import { useAdminCardSearch } from "@/hooks/use-card-search";
import { useKeywordStyles } from "@/hooks/use-keyword-styles";
import {
  describeAcceptCardFieldIssues,
  hasRequiredActiveFields,
} from "@/lib/accept-card-validation";
import { queryKeys } from "@/lib/query-keys";
import { PERSISTENT_ERROR_TOAST } from "@/lib/toast";

interface NewCardColumnActionsProps {
  row?: CandidateCardResponse | CandidatePrintingResponse;
  newCardFields: FieldDef<NewCardFieldKey>[];
  setActiveCard: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  onIgnoreSource: (input: { provider: string; externalId: string }) => void;
  onResolveSubmission: (candidateCardId: string, mode: "reject" | "reply") => void;
  isAdmin: boolean;
}

function NewCardColumnActions({
  row,
  newCardFields,
  setActiveCard,
  onIgnoreSource,
  onResolveSubmission,
  isAdmin,
}: NewCardColumnActionsProps) {
  if (!row) {
    return null;
  }
  const cardRow = row as CandidateCardResponse;
  // For a submission, ignoring is rejecting; it must tell the contributor why.
  const isUserSubmission = cardRow.provider === USER_SUBMISSION_PROVIDER;
  return (
    <>
      <DropdownMenuItem
        onClick={() => {
          const record = row as unknown as Record<string, unknown>;
          for (const field of newCardFields) {
            if (field.readOnly) {
              continue;
            }
            const val = record[field.key];
            if (val !== null && val !== undefined && val !== "") {
              setActiveCard((prev) => ({ ...prev, [field.key]: val }));
            }
          }
        }}
      >
        <CopyCheckIcon className="mr-2 size-3.5" />
        Accept all fields
      </DropdownMenuItem>
      {isAdmin && isUserSubmission && (
        <DropdownMenuItem onClick={() => onResolveSubmission(cardRow.id, "reply")}>
          <MessageSquareIcon className="mr-2 size-3.5" />
          Reply to contributor
        </DropdownMenuItem>
      )}
      {isAdmin && (
        <DropdownMenuItem
          onClick={() => {
            if (isUserSubmission) {
              onResolveSubmission(cardRow.id, "reject");
              return;
            }
            onIgnoreSource({ provider: cardRow.provider, externalId: row.externalId });
          }}
        >
          <BanIcon className="mr-2 size-3.5" />
          {isUserSubmission ? "Reject submission" : "Ignore permanently"}
        </DropdownMenuItem>
      )}
    </>
  );
}

export function NewCardDetailPage({ identifier }: { identifier: string }) {
  const navigate = useNavigate();
  const { data: access } = useAdminAccess();
  // card-review grant holders keep the per-field accept flow; linking,
  // check/uncheck bookkeeping, and ignoring stay full-admin.
  const isAdmin = access?.isAdmin === true;

  // allCards is included because accepting/linking adds a new accepted card to
  // the search dropdown.
  const invalidateScope = [
    queryKeys.admin.cards.unmatched(identifier),
    queryKeys.admin.cards.list,
    queryKeys.admin.cards.allCards,
  ];

  const { data: unmatchedData, isLoading } = useUnmatchedCardDetail(identifier) as {
    data: UnmatchedCardDetailResponse | undefined;
    isLoading: boolean;
  };

  const {
    providerSettings,
    newCardFields,
    printingSourceFields,
    checkCandidateCard,
    uncheckCandidateCard,
    checkPrintingSource,
    uncheckPrintingSource,
    ignoreCardSource,
  } = useCardDetailData(invalidateScope);

  const acceptNewCard = useAcceptNewCard();
  const linkCard = useLinkCard();
  const reassignPrinting = useReassignCandidatePrinting(invalidateScope);
  const { data: allCards } = useAllCards();
  const keywordStyles = useKeywordStyles();
  const costKeywords = Object.entries(keywordStyles)
    .filter(([, entry]) => entry.costKeyword)
    .map(([name]) => name);

  // Null until the admin edits the Active column; from the first edit on it is
  // their explicit choice and the pre-seed (derived below) stops applying.
  const [edits, setEdits] = useState<Record<string, unknown> | null>(null);
  const [newCardId, setNewCardId] = useState<string | null>(null);
  const [linkCardId, setLinkCardId] = useState("");
  const [linkSearch, setLinkSearch] = useState("");
  // Must run before the loading-state early return below to keep hook order fixed.
  const cardSearchResults = useAdminCardSearch(allCards, linkSearch);
  const [resolution, setResolution] = useState<{
    candidateCardId: string;
    mode: "reject" | "reply";
  } | null>(null);

  const preseeded = unmatchedData
    ? buildPreseededActiveCard(unmatchedData.sources, newCardFields, providerSettings)
    : {};
  const activeCard = edits ?? preseeded;
  const editActiveCard = (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
    setEdits((prev) => updater(prev ?? preseeded));
  };

  if (isLoading || !unmatchedData) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const sources = unmatchedData.sources;
  const resolutionSource = sources.find((s) => s.id === resolution?.candidateCardId);
  const candidatePrintings = unmatchedData.candidatePrintings;
  const defaultCardId = unmatchedData.defaultCardId;
  const newModeCardId = newCardId ?? defaultCardId;
  const hasRequiredFields = hasRequiredActiveFields(activeCard);
  const isPreseeded = edits === null && Object.keys(activeCard).length > 0;

  const {
    labels: sourceLabels,
    names: sourceNames,
    submitters: sourceSubmitters,
  } = buildSourceLabels(sources);

  const groups = buildPrintingGroups(unmatchedData.candidatePrintingGroups, candidatePrintings);

  function handleAcceptAsNew() {
    if (!hasRequiredFields || !newModeCardId.trim()) {
      return;
    }
    const id = newModeCardId.trim();
    const cardFields = { id, ...activeCard } as AcceptNewCardBody["cardFields"];
    const issues = describeAcceptCardFieldIssues(cardFields);
    if (issues.length > 0) {
      toast.error(`Can't accept this card:\n${issues.join("\n")}`, PERSISTENT_ERROR_TOAST);
      return;
    }
    acceptNewCard.mutate(
      { name: identifier, cardFields },
      {
        onSuccess: () => {
          void navigate({ to: "/admin/cards/$cardSlug", params: { cardSlug: id } });
        },
      },
    );
  }

  function handleLink() {
    if (!linkCardId.trim()) {
      return;
    }
    const targetId = linkCardId.trim();
    const targetSlug = allCards?.find((c) => c.id === targetId)?.slug ?? targetId;
    linkCard.mutate(
      { name: identifier, cardId: targetId },
      {
        onSuccess: () => {
          void navigate({ to: "/admin/cards/$cardSlug", params: { cardSlug: targetSlug } });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader>
        <SectionHeaderGroup>
          <SectionHeaderTitle>{unmatchedData.displayName}</SectionHeaderTitle>
          <SectionHeaderDescription>
            Candidate card ({sources.length} source
            {sources.length === 1 ? "" : "s"})
          </SectionHeaderDescription>
        </SectionHeaderGroup>
      </SectionHeader>

      <section className="space-y-2">
        <Heading level={3}>Card Fields</Heading>
        <p className="text-muted-foreground text-sm">
          {isPreseeded
            ? "The Active column is pre-filled from the highest-priority source. Review it, click any cell to override, then accept below. Nothing is saved yet."
            : "Click a cell to select it for the new card. The Active column shows your selections."}
        </p>
        <CandidateSpreadsheet
          fields={newCardFields}
          requiredKeys={["name", "types", "domains"]}
          activeRow={Object.keys(activeCard).length > 0 ? activeCard : null}
          candidateRows={sources}
          submitters={sourceSubmitters}
          providerSettings={providerSettings}
          costKeywords={costKeywords}
          activeColumnBadge={
            isPreseeded ? (
              <Badge variant="warning" className="font-normal">
                Pre-filled
              </Badge>
            ) : null
          }
          onCellClick={(field, value) => {
            editActiveCard((prev) => ({ ...prev, [field]: value }));
          }}
          onActiveChange={(field, value) => {
            editActiveCard((prev) =>
              value === null || value === undefined
                ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
                : { ...prev, [field]: value },
            );
          }}
          onCheck={isAdmin ? (candidateId) => checkCandidateCard.mutate(candidateId) : undefined}
          onUncheck={
            isAdmin ? (candidateId) => uncheckCandidateCard.mutate(candidateId) : undefined
          }
          columnActions={
            <NewCardColumnActions
              newCardFields={newCardFields}
              setActiveCard={editActiveCard}
              onIgnoreSource={(input) => ignoreCardSource.mutate(input)}
              onResolveSubmission={(candidateCardId, mode) =>
                setResolution({ candidateCardId, mode })
              }
              isAdmin={isAdmin}
            />
          }
        />
        <SubmissionResolutionDialog
          candidateCardId={resolution?.candidateCardId ?? null}
          mode={resolution?.mode ?? "reply"}
          onOpenChange={(open) => {
            if (!open) {
              setResolution(null);
            }
          }}
          onConfirmed={() => {
            if (resolution?.mode === "reject" && resolutionSource) {
              ignoreCardSource.mutate({
                provider: resolutionSource.provider,
                externalId: resolutionSource.externalId,
              });
            }
          }}
        />
      </section>

      <section className="flex flex-wrap items-end gap-4 rounded-md border p-4">
        {isAdmin && (
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label>Link to existing card</Label>
              <CardSearchDropdown
                results={cardSearchResults}
                onSearch={(q) => {
                  setLinkSearch(q);
                  setLinkCardId("");
                }}
                onSelect={(id) => setLinkCardId(id)}
                placeholder="Search by name…"
                className="w-64"
              />
            </div>
            <Button
              variant="outline"
              disabled={!linkCardId.trim() || linkCard.isPending}
              onClick={handleLink}
            >
              <LinkIcon className="mr-1 size-4" />
              Link
            </Button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label>Card ID</Label>
            <Input
              value={newModeCardId}
              onChange={(e) => setNewCardId(e.target.value)}
              placeholder={defaultCardId || "e.g. SFD-T02"}
              className="w-40 font-mono"
            />
          </div>
          <Button
            disabled={!hasRequiredFields || !newModeCardId.trim() || acceptNewCard.isPending}
            onClick={handleAcceptAsNew}
          >
            <PlusIcon className="mr-1 size-4" />
            Accept as new card
          </Button>
        </div>
        {!hasRequiredFields && (
          <p className="text-muted-foreground">Select name, type, and domains first.</p>
        )}
      </section>

      <section className="space-y-3">
        <Heading level={3}>Printings</Heading>
        {groups.map((group) => {
          const guessedId = group.expectedPrintingId;

          return (
            <div key={group.groupKey} className="rounded-md border border-dashed">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-medium">
                  {guessedId} ({group.candidates.length} source
                  {group.candidates.length === 1 ? "" : "s"})
                </span>
                {groups.length > 1 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" className="shrink-0" />}
                    >
                      <EllipsisVerticalIcon className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {groups
                        .filter((g) => g.groupKey !== group.groupKey)
                        .map((target) => {
                          const targetId = target.expectedPrintingId;
                          return (
                            <DropdownMenuItem
                              key={target.groupKey}
                              disabled={reassignPrinting.isPending}
                              onClick={() => {
                                const t = target.candidates[0];
                                group.candidates.forEach((s) =>
                                  // The cast is safe: the route's patch schema doesn't
                                  // declare these fields but strips/validates them server-side.
                                  reassignPrinting.mutate({
                                    id: s.id,
                                    fields: {
                                      setId: t.setId,
                                      artVariant: t.artVariant,
                                      isSigned: t.isSigned,
                                      isOvernumbered: t.isOvernumbered,
                                      markerSlugs: t.markerSlugs,
                                      rarity: t.rarity,
                                      finish: t.finish,
                                    } as PatchCandidatePrintingBody,
                                  }),
                                );
                              }}
                            >
                              <ArrowRightIcon className="mr-2 size-3.5" />
                              Merge into {targetId}
                            </DropdownMenuItem>
                          );
                        })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="flex flex-col gap-3 border-t p-3 lg:flex-row">
                <GroupImagePreview
                  sources={group.candidates}
                  providerLabels={sourceLabels}
                  providerSettings={providerSettings}
                />
                <div className="min-w-0 flex-1">
                  <CandidateSpreadsheet
                    fields={printingSourceFields}
                    activeRow={null}
                    candidateRows={group.candidates}
                    providerLabels={sourceLabels}
                    providerNames={sourceNames}
                    submitters={sourceSubmitters}
                    providerSettings={providerSettings}
                    onCheck={isAdmin ? (id) => checkPrintingSource.mutate(id) : undefined}
                    onUncheck={isAdmin ? (id) => uncheckPrintingSource.mutate(id) : undefined}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
