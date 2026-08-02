import type {
  AdminCardResponse,
  CandidateCardResponse,
  CandidatePrintingResponse,
  ProviderSettingResponse,
} from "@openrift/shared";
import type { AcceptCardField } from "@openrift/shared/contracts/admin/card-mutations";
import { isAcceptCardField } from "@openrift/shared/contracts/admin/card-mutations";
import { BanIcon, CheckCheckIcon, CopyCheckIcon } from "lucide-react";

import { CandidateSpreadsheet } from "@/components/admin/candidate-spreadsheet";
import type { CandidateCardFieldKey, FieldDef } from "@/components/admin/candidate-spreadsheet";
import { CardBanManager } from "@/components/admin/card-ban-manager";
import { CardErrataManager } from "@/components/admin/card-errata-manager";
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
  /** Ignoring is triage and stays full-admin; card-review grant holders only accept. */
  isAdmin: boolean;
}

function CardSourceColumnActions({
  row,
  cardId,
  candidateCardFields,
  onAcceptField,
  onIgnoreSource,
  isAdmin,
}: CardSourceColumnActionsProps) {
  if (!row) {
    return null;
  }
  const cardRow = row as CandidateCardResponse;
  return (
    <>
      <DropdownMenuItem
        onClick={() => {
          const record = row as unknown as Record<string, unknown>;
          for (const field of candidateCardFields) {
            // The grid also carries read-only provider columns (externalId,
            // extraData) that the accept endpoint does not take; the contract's
            // own field list decides what is sendable.
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
      {isAdmin && (
        <DropdownMenuItem
          onClick={() =>
            onIgnoreSource({
              provider: cardRow.provider,
              externalId: row.externalId,
            })
          }
        >
          <BanIcon className="mr-2" />
          Ignore permanently
        </DropdownMenuItem>
      )}
    </>
  );
}

interface CardFieldsSectionProps {
  card: AdminCardResponse;
  /** The card's candidate sources, one column each in the compare grid. */
  sources: CandidateCardResponse[];
  candidateCardFields: FieldDef<CandidateCardFieldKey>[];
  providerSettings: ProviderSettingResponse[];
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Checks every source at once; shared with the header's full review run. */
  onCheckAllSources: () => void;
  isCheckingAllSources: boolean;
  showBanForm: boolean;
  onShowBanFormChange: (show: boolean) => void;
  showErrataForm: boolean;
  onShowErrataFormChange: (show: boolean) => void;
  /** Query keys this section's mutations invalidate. */
  invalidates: readonly (readonly unknown[])[];
  /** Card-review grant holders accept fields; check/ignore, bans and errata are full-admin. */
  isAdmin: boolean;
}

/**
 * The card-level compare grid: accepted values in the Active column against one
 * column per candidate source, with the ban and errata managers below it.
 *
 * @returns The Card Fields section element.
 */
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

  const uncheckedCount = sources.filter((s) => !s.checkedAt).length;

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
                isAdmin={isAdmin}
              />
            }
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
