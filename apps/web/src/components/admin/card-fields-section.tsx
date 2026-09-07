import type { AcceptCardField } from "@openrift/shared/contracts/admin/card-mutations";
import { isAcceptCardField } from "@openrift/shared/contracts/admin/card-mutations";
import { USER_SUBMISSION_PROVIDER } from "@openrift/shared/contracts/card-submissions";
import type {
  AdminCardResponse,
  CandidateCardResponse,
  CandidatePrintingResponse,
  ProviderSettingResponse,
} from "@openrift/shared/types/api/admin";
import { BanIcon, CheckCheckIcon, CopyCheckIcon, MessageSquareIcon } from "lucide-react";
import { useState } from "react";

import { CandidateSpreadsheet } from "@/components/admin/candidate-spreadsheet";
import type { CandidateCardFieldKey, FieldDef } from "@/components/admin/candidate-spreadsheet";
import { CardBanManager } from "@/components/admin/card-ban-manager";
import { CardErrataManager } from "@/components/admin/card-errata-manager";
import { SubmissionResolutionDialog } from "@/components/admin/submission-resolution-dialog";
import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import {
  useAcceptCardField,
  useCheckCandidateCard,
  useUncheckCandidateCard,
} from "@/hooks/use-admin-card-mutations";
import { useIgnoreCandidateCard } from "@/hooks/use-ignored-candidates";
import { buildSourceSubmitters } from "@/lib/candidate-submitter";

interface CardSourceColumnActionsProps {
  row?: CandidateCardResponse | CandidatePrintingResponse;
  cardId: string;
  candidateCardFields: FieldDef<CandidateCardFieldKey>[];
  onAcceptField: (input: {
    cardId: string;
    field: AcceptCardField;
    value: unknown;
    source?: "manual" | "provider";
  }) => void;
  onIgnoreSource: (input: { provider: string; externalId: string }) => void;
  onResolveSubmission: (candidateCardId: string, mode: "reject" | "reply") => void;
  isAdmin: boolean;
}

function CardSourceColumnActions({
  row,
  cardId,
  candidateCardFields,
  onAcceptField,
  onIgnoreSource,
  onResolveSubmission,
  isAdmin,
}: CardSourceColumnActionsProps) {
  if (!row) {
    return null;
  }
  const cardRow = row as CandidateCardResponse;
  // A submission's external_id is minted per submission and never re-uploaded.
  const isUserSubmission = cardRow.provider === USER_SUBMISSION_PROVIDER;
  return (
    <>
      <DropdownMenuItem
        onClick={() => {
          const record = row as unknown as Record<string, unknown>;
          for (const field of candidateCardFields) {
            // The grid also carries read-only provider columns the accept endpoint does not take.
            if (!isAcceptCardField(field.key)) {
              continue;
            }
            const val = record[field.key];
            if (val !== null && val !== undefined && val !== "") {
              onAcceptField({ cardId, field: field.key, value: val, source: "provider" });
            }
          }
        }}
      >
        <CopyCheckIcon className="mr-2" />
        Accept all fields
      </DropdownMenuItem>
      {isAdmin && isUserSubmission && (
        <DropdownMenuItem onClick={() => onResolveSubmission(cardRow.id, "reply")}>
          <MessageSquareIcon className="mr-2" />
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
          <BanIcon className="mr-2" />
          {isUserSubmission ? "Reject submission" : "Ignore permanently"}
        </DropdownMenuItem>
      )}
    </>
  );
}

interface CardFieldsSectionProps {
  card: AdminCardResponse;
  sources: CandidateCardResponse[];
  candidateCardFields: FieldDef<CandidateCardFieldKey>[];
  providerSettings: ProviderSettingResponse[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onCheckAllSources: () => void;
  isCheckingAllSources: boolean;
  showBanForm: boolean;
  onShowBanFormChange: (show: boolean) => void;
  showErrataForm: boolean;
  onShowErrataFormChange: (show: boolean) => void;
  invalidates: readonly (readonly unknown[])[];
  isAdmin: boolean;
}

export function CardFieldsSection({
  card,
  sources,
  candidateCardFields,
  providerSettings,
  expanded,
  onToggleExpanded,
  onCheckAllSources,
  isCheckingAllSources,
  showBanForm,
  onShowBanFormChange,
  showErrataForm,
  onShowErrataFormChange,
  invalidates,
  isAdmin,
}: CardFieldsSectionProps) {
  const acceptCardField = useAcceptCardField(invalidates);
  const checkCandidateCard = useCheckCandidateCard(invalidates);
  const uncheckCandidateCard = useUncheckCandidateCard(invalidates);
  const ignoreCardSource = useIgnoreCandidateCard();
  // The column menu is cloned per source column; dialog state must live here, not in the menu.
  const [resolution, setResolution] = useState<{
    candidateCardId: string;
    mode: "reject" | "reply";
  } | null>(null);

  const uncheckedCount = sources.filter((s) => !s.checkedAt).length;
  const submitters = buildSourceSubmitters(sources);
  const resolutionSource = sources.find((s) => s.id === resolution?.candidateCardId);

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <ExpandToggle expanded={expanded} className="hover:opacity-80" onClick={onToggleExpanded}>
          <Heading level={3}>Card Fields</Heading>
        </ExpandToggle>
        {isAdmin && uncheckedCount > 0 && (
          <Button variant="outline" disabled={isCheckingAllSources} onClick={onCheckAllSources}>
            <CheckCheckIcon className="mr-1" />
            Check {uncheckedCount} unchecked
          </Button>
        )}
      </div>
      {expanded && (
        <>
          <CandidateSpreadsheet
            fields={candidateCardFields}
            requiredKeys={["name", "types", "domains"]}
            activeRow={{ ...card }}
            candidateRows={sources}
            submitters={submitters}
            providerSettings={providerSettings}
            onCellClick={(field, value) => {
              if (!isAcceptCardField(field)) {
                return;
              }
              acceptCardField.mutate({ cardId: card.id, field, value, source: "provider" });
            }}
            onActiveChange={(field, value) => {
              if (value === undefined || !isAcceptCardField(field)) {
                return;
              }
              acceptCardField.mutate({ cardId: card.id, field, value });
            }}
            onCheck={isAdmin ? (candidateId) => checkCandidateCard.mutate(candidateId) : undefined}
            onUncheck={
              isAdmin ? (candidateId) => uncheckCandidateCard.mutate(candidateId) : undefined
            }
            columnActions={
              <CardSourceColumnActions
                cardId={card.id}
                candidateCardFields={candidateCardFields}
                onAcceptField={(input) => acceptCardField.mutate(input)}
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
              // The rejection itself is the ignore; the dialog only owns the
              // message that goes with it.
              if (resolution?.mode === "reject" && resolutionSource) {
                ignoreCardSource.mutate({
                  provider: resolutionSource.provider,
                  externalId: resolutionSource.externalId,
                });
              }
            }}
          />
          {isAdmin && (
            <CardBanManager
              cardId={card.id}
              showForm={showBanForm}
              onShowFormChange={onShowBanFormChange}
            />
          )}
          {isAdmin && (
            <CardErrataManager
              cardId={card.id}
              errata={card.errata}
              showForm={showErrataForm}
              onShowFormChange={onShowErrataFormChange}
            />
          )}
        </>
      )}
    </section>
  );
}
