import type { TournamentParticipantResponse } from "@openrift/shared/types/api/tournament";
import { Link } from "@tanstack/react-router";
import {
  ArmchairIcon,
  CheckIcon,
  CopyIcon,
  CrownIcon,
  EllipsisVerticalIcon,
  GlobeIcon,
  LayersIcon,
  Link2Icon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  UnlinkIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { PARTICIPANT_STATUS_LABEL } from "@/features/tournaments/lib/tournament-display";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useRegionLabel } from "@/hooks/use-region-label";
import { getSiteUrl } from "@/lib/site-config";
import { cn } from "@/lib/utils";

export type ParticipantAction =
  | "drop"
  | "reactivate"
  | "approve"
  | "deny"
  | "remove"
  | "unlink"
  | "reissue";

export interface ParticipantTarget {
  participantId: string;
  name: string;
}

export function participantMissesRegion(
  participant: TournamentParticipantResponse,
  regionsEnabled: boolean,
): boolean {
  return regionsEnabled && participant.status === "active" && participant.region === null;
}

export function participantMissesLegend(
  participant: TournamentParticipantResponse,
  legendTiebreak: boolean,
): boolean {
  return legendTiebreak && participant.status === "active" && participant.legendCardId === null;
}

function statusBadgeVariant(status: TournamentParticipantResponse["status"]) {
  return status === "active" ? ("secondary" as const) : ("outline" as const);
}

export interface ParticipantRowProps {
  participant: TournamentParticipantResponse;
  tournamentId: string;
  regionsEnabled: boolean;
  manage: boolean;
  canAssignRegion: boolean;
  canAssignLegend?: boolean;
  legendTiebreak?: boolean;
  dimmed?: boolean;
  teammateName?: string;
  deckEntryId?: string;
  actionPending: boolean;
  onAction: (participantId: string, action: ParticipantAction) => void;
  onRename: (target: ParticipantTarget) => void;
  onSetLegend?: (target: ParticipantTarget & { legendName: string | null }) => void;
  onSetRegion: (target: ParticipantTarget & { region: string }) => void;
  onSetFixedTable: (target: ParticipantTarget & { fixedTable: string }) => void;
  onRemove: (target: ParticipantTarget) => void;
}

export function ParticipantRow({
  participant,
  tournamentId,
  regionsEnabled,
  manage,
  canAssignRegion,
  canAssignLegend = false,
  legendTiebreak = false,
  dimmed = false,
  teammateName,
  deckEntryId,
  actionPending,
  onAction,
  onRename,
  onSetLegend,
  onSetRegion,
  onSetFixedTable,
  onRemove,
}: ParticipantRowProps) {
  const regionLabel = useRegionLabel();
  const { copy } = useCopyToClipboard();
  const missesRegion = participantMissesRegion(participant, regionsEnabled);
  const missesLegend = participantMissesLegend(participant, legendTiebreak);
  const target: ParticipantTarget = {
    participantId: participant.id,
    name: participant.displayName,
  };

  async function handleCopyClaimLink() {
    const token = participant.claimToken;
    if (!token) {
      return;
    }
    if (await copy(`${getSiteUrl()}/tournaments/claim/${token}`)) {
      toast.success("Claim link copied");
    } else {
      toast.error("Could not copy the claim link");
    }
  }

  return (
    <Card className={cn("flex-row flex-wrap items-center gap-3 p-3", dimmed && "opacity-50")}>
      <UserAvatar
        name={participant.userName ?? participant.displayName}
        className="size-9 shrink-0"
      />
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="truncate font-medium">{participant.displayName}</span>
        <Badge variant={statusBadgeVariant(participant.status)}>
          {PARTICIPANT_STATUS_LABEL[participant.status]}
        </Badge>
        {teammateName ? (
          <Badge variant="outline" title={`Teamed with ${teammateName}`}>
            <UsersIcon className="size-3" />
            {teammateName}
          </Badge>
        ) : null}
        {regionsEnabled && participant.region ? (
          <Badge variant="outline">{regionLabel(participant.region)}</Badge>
        ) : missesRegion ? (
          <Badge variant="warning">
            <GlobeIcon className="size-3" />
            No region
          </Badge>
        ) : null}
        {participant.groupLabel === null ? null : (
          <Badge variant="info">Group {participant.groupLabel}</Badge>
        )}
        {participant.legendName ? (
          <Badge variant="subtle">
            <CrownIcon className="size-3" />
            {participant.legendName}
          </Badge>
        ) : missesLegend ? (
          <Badge variant="muted">
            <CrownIcon className="size-3" />
            No Legend
          </Badge>
        ) : null}
        {participant.fixedTable === null ? null : (
          <Badge
            variant="outline"
            title={`Normally seated at table ${participant.fixedTable}. Pairings are unaffected; the table steers where their match is placed.`}
          >
            <ArmchairIcon className="size-3" />
            Table {participant.fixedTable}
          </Badge>
        )}
        {participant.userId ? (
          <Badge
            variant="subtle"
            title={
              participant.userName
                ? `Linked to the OpenRift account of ${participant.userName}`
                : "Linked to an OpenRift account"
            }
          >
            <Link2Icon className="size-3" />
            {participant.userName ?? "Linked"}
          </Badge>
        ) : null}
      </span>
      {manage ? (
        <span className="flex shrink-0 items-center gap-1">
          {missesRegion ? (
            <Button
              size="sm"
              variant="outline"
              className="hidden sm:inline-flex"
              onClick={() => onSetRegion({ ...target, region: "none" })}
            >
              <GlobeIcon className="size-4" />
              Set region
            </Button>
          ) : null}
          {missesLegend && canAssignLegend && onSetLegend ? (
            <Button
              size="sm"
              variant="outline"
              className="hidden sm:inline-flex"
              onClick={() => onSetLegend({ ...target, legendName: null })}
            >
              <CrownIcon className="size-4" />
              Set Legend
            </Button>
          ) : null}
          {deckEntryId ? (
            <Button
              size="sm"
              className="hidden sm:inline-flex"
              render={
                <Link
                  to="/tournaments/$id/decks/$entryId"
                  params={{ id: tournamentId, entryId: deckEntryId }}
                />
              }
            >
              <LayersIcon className="size-4" />
              Deck
            </Button>
          ) : null}
          {participant.status === "requested" ? (
            <>
              <Button
                size="sm"
                aria-label="Approve"
                disabled={actionPending}
                onClick={() => onAction(participant.id, "approve")}
              >
                <CheckIcon className="size-4" />
                <span className="hidden sm:inline">Approve</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Deny"
                className="text-destructive"
                disabled={actionPending}
                onClick={() => onAction(participant.id, "deny")}
              >
                <XIcon className="size-4" />
                <span className="hidden sm:inline">Deny</span>
              </Button>
            </>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="sm" variant="ghost" aria-label="Participant actions" />}
            >
              <EllipsisVerticalIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {deckEntryId ? (
                <DropdownMenuItem
                  render={
                    <Link
                      to="/tournaments/$id/decks/$entryId"
                      params={{ id: tournamentId, entryId: deckEntryId }}
                    />
                  }
                >
                  <LayersIcon className="size-4" />
                  Deck
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => onRename(target)}>
                <PencilIcon className="size-4" />
                Rename
              </DropdownMenuItem>
              {canAssignRegion ? (
                <DropdownMenuItem
                  onClick={() => onSetRegion({ ...target, region: participant.region ?? "none" })}
                >
                  <GlobeIcon className="size-4" />
                  Set region
                </DropdownMenuItem>
              ) : null}
              {canAssignLegend && onSetLegend ? (
                <DropdownMenuItem
                  onClick={() => onSetLegend({ ...target, legendName: participant.legendName })}
                >
                  <CrownIcon className="size-4" />
                  Set Legend
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={() =>
                  onSetFixedTable({
                    ...target,
                    fixedTable:
                      participant.fixedTable === null ? "" : String(participant.fixedTable),
                  })
                }
              >
                <ArmchairIcon className="size-4" />
                Set fixed table
              </DropdownMenuItem>
              {participant.status === "active" ? (
                <DropdownMenuItem
                  disabled={actionPending}
                  onClick={() => onAction(participant.id, "drop")}
                >
                  <UserMinusIcon className="size-4" />
                  Drop
                </DropdownMenuItem>
              ) : participant.status === "dropped" || participant.status === "no_show" ? (
                <DropdownMenuItem
                  disabled={actionPending}
                  onClick={() => onAction(participant.id, "reactivate")}
                >
                  <UserPlusIcon className="size-4" />
                  Reactivate
                </DropdownMenuItem>
              ) : null}
              {participant.userId ? (
                <DropdownMenuItem
                  disabled={actionPending}
                  onClick={() => onAction(participant.id, "unlink")}
                >
                  <UnlinkIcon className="size-4" />
                  Unlink
                </DropdownMenuItem>
              ) : participant.claimBlocked ? (
                <DropdownMenuItem
                  disabled={actionPending}
                  onClick={() => onAction(participant.id, "reissue")}
                >
                  <RotateCcwIcon className="size-4" />
                  Re-issue claim link
                </DropdownMenuItem>
              ) : participant.claimToken ? (
                <DropdownMenuItem onClick={() => void handleCopyClaimLink()}>
                  <CopyIcon className="size-4" />
                  Copy claim link
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onRemove(target)}>
                <Trash2Icon className="size-4" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ) : canAssignRegion ? (
        <span className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant={missesRegion ? "outline" : "ghost"}
            onClick={() => onSetRegion({ ...target, region: participant.region ?? "none" })}
          >
            <GlobeIcon className="size-4" />
            Set region
          </Button>
        </span>
      ) : null}
    </Card>
  );
}
