import type {
  TournamentDetailResponse,
  TournamentStaffMemberResponse,
  TournamentStaffRole,
} from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  EllipsisVerticalIcon,
  GavelIcon,
  LinkIcon,
  PlusIcon,
  ShieldIcon,
  Trash2Icon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useState } from "react";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { ShareLinkRow } from "@/components/share/share-link-row";
import { ActionBand } from "@/components/ui/action-band";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/user-avatar";
import {
  useAddTournamentStaff,
  useRemoveTournamentStaff,
  useSetTournamentStaffInvite,
  useTournamentStaffCandidates,
} from "@/hooks/use-tournaments";
import { getSiteUrl } from "@/lib/site-config";
import { isTournamentHost, STAFF_ROLE_LABEL } from "@/lib/tournament-display";

const ROLE_ITEMS: { value: TournamentStaffRole; label: string }[] = [
  { value: "organizer", label: "Organizer" },
  { value: "judge", label: "Judge" },
];

const ORG_ROLE_LABEL: Record<"owner" | "manager" | "judge", string> = {
  owner: "Owner",
  manager: "Manager",
  judge: "Judge",
};

/** Per-role section chrome: plural heading, empty-state icon, and the noun the
 * empty copy and the invite dialog both read. */
const ROLE_SECTION: Record<
  TournamentStaffRole,
  { heading: string; icon: ComponentType<SVGProps<SVGSVGElement>>; empty: string }
> = {
  organizer: { heading: "Organizers", icon: ShieldIcon, empty: "No organizers yet" },
  judge: { heading: "Judges", icon: GavelIcon, empty: "No judges yet" },
};

export function TournamentStaffTab({ detail }: { detail: TournamentDetailResponse }) {
  const host = isTournamentHost(detail.myRoles);

  return (
    <div className="flex flex-col gap-6">
      {/* Grouped by role rather than in API order: the question this page
          answers first is "does the event have a judge?", which an interleaved
          flat list can't answer at a glance. */}
      <StaffRoleSection detail={detail} staffRole="organizer" host={host} />
      <StaffRoleSection detail={detail} staffRole="judge" host={host} />

      {detail.host.type === "organization" && detail.host.orgId ? (
        <p className="text-muted-foreground text-sm">
          Owners and managers of{" "}
          <Link
            to="/organizations/$id"
            params={{ id: detail.host.orgId }}
            className="font-medium underline"
          >
            {detail.host.displayName}
          </Link>{" "}
          are staff automatically and cannot be removed here. Manage who has that access on the
          organization page.
        </p>
      ) : null}

      {host ? <StaffInviteBand detail={detail} /> : null}
    </div>
  );
}

/**
 * One role's staff, under a counted heading. An empty group says so rather
 * than vanishing — a tournament with no judge is a fact the host needs to see.
 * @returns The role section.
 */
function StaffRoleSection({
  detail,
  staffRole,
  host,
}: {
  detail: TournamentDetailResponse;
  staffRole: TournamentStaffRole;
  host: boolean;
}) {
  const section = ROLE_SECTION[staffRole];
  const members = detail.staff.filter((member) => member.role === staffRole);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading count={members.length}>{section.heading}</SectionHeading>
      {members.length === 0 ? (
        <Empty className="border py-8">
          <EmptyHeader>
            <EmptyMedia>
              <section.icon className="text-muted-foreground size-8" />
            </EmptyMedia>
            <EmptyDescription>
              {section.empty}
              {host
                ? ` — add someone directly, or share the ${STAFF_ROLE_LABEL[
                    staffRole
                  ].toLowerCase()} invite link below.`
                : "."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li key={`${member.userId}-${member.source}-${member.role}`}>
              <StaffRow detail={detail} member={member} host={host} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StaffRow({
  detail,
  member,
  host,
}: {
  detail: TournamentDetailResponse;
  member: TournamentStaffMemberResponse;
  host: boolean;
}) {
  const removeStaff = useRemoveTournamentStaff();
  const canRemove = host && member.source === "grant";

  return (
    <Card className="flex-row items-center gap-3 p-3">
      <UserAvatar name={member.name} className="size-9 shrink-0" />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate font-medium">{member.name ?? member.userId}</span>
        {/* The role is the section heading now, so the only chip left is the
            one that changes what you can do: org-derived staff can't be
            removed here. Full provenance rides along as the title. */}
        {member.source === "organization" && member.orgRole ? (
          <Badge
            variant="subtle"
            className="shrink-0"
            title={`${ORG_ROLE_LABEL[member.orgRole]} of ${detail.host.displayName}`}
          >
            via org
          </Badge>
        ) : null}
      </span>
      {canRemove ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button size="icon-sm" variant="ghost" aria-label="Staff actions" />}
          >
            <EllipsisVerticalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              disabled={removeStaff.isPending}
              onClick={async () => {
                try {
                  await removeStaff.mutateAsync({
                    id: detail.id,
                    userId: member.userId,
                    role: member.role,
                  });
                } catch {
                  // Reported by the global mutation error toast (see reportMutationError).
                }
              }}
            >
              <Trash2Icon className="size-4" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : host ? (
        // Org-derived rows have no menu; the spacer keeps their name column
        // ending where the removable rows' does. Non-hosts see no menu on any
        // row, so the column doesn't exist and needs no spacer.
        <span aria-hidden="true" className="size-7 shrink-0" />
      ) : null}
    </Card>
  );
}

/**
 * The host's reusable staff-invite links as the page's action band. One row per
 * role, always the same shape: anyone the host shares a link with confirms
 * while logged in to take the role, so no email or user search is needed.
 * Disabling retires the link (confirmed, since it breaks any link already
 * shared); creating again mints a fresh one.
 *
 * Static band — its rows hold real buttons, so it takes no `render`.
 * @returns The invite-link band for organizer and judge.
 */
function StaffInviteBand({ detail }: { detail: TournamentDetailResponse }) {
  const activeCount = [detail.organizerInviteToken, detail.judgeInviteToken].filter(
    (token) => token !== null,
  ).length;

  return (
    <ActionBand
      icon={LinkIcon}
      label="Invite links"
      value={activeCount}
      sub="active · anyone with the link can claim the role"
    >
      <div className="flex flex-col gap-2">
        <StaffInviteRow id={detail.id} staffRole="organizer" token={detail.organizerInviteToken} />
        <StaffInviteRow id={detail.id} staffRole="judge" token={detail.judgeInviteToken} />
      </div>
    </ActionBand>
  );
}

function StaffInviteRow({
  id,
  staffRole,
  token,
}: {
  id: string;
  staffRole: TournamentStaffRole;
  token: string | null;
}) {
  const setInvite = useSetTournamentStaffInvite();
  const [disableOpen, setDisableOpen] = useState(false);
  const roleLabel = STAFF_ROLE_LABEL[staffRole];
  const roleNoun = staffRole === "judge" ? "a judge" : "an organizer";
  // Built from the env-backed origin, never a hardcoded site URL.
  const url = token ? `${getSiteUrl()}/tournaments/staff-invite/${token}` : null;

  async function run(enabled: boolean) {
    try {
      await setInvite.mutateAsync({ id, role: staffRole, enabled });
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  return (
    // The role chip sits on its own line above the link rather than inside it:
    // ShareLinkRow already wraps its field and buttons, and squeezing a badge
    // into that row is what crushed the URL to a few pixels on a phone before.
    <div className="bg-muted/40 flex flex-col gap-2 rounded-lg px-2.5 py-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="shrink-0">
          {roleLabel}
        </Badge>
        {url ? null : (
          <>
            <span className="text-muted-foreground text-xs">No link yet</span>
            <Button
              size="sm"
              className="ml-auto"
              aria-label={`Create link for ${roleLabel.toLowerCase()}`}
              disabled={setInvite.isPending}
              onClick={() => void run(true)}
            >
              Create link
            </Button>
          </>
        )}
      </div>
      {url ? (
        <>
          <ShareLinkRow
            url={url}
            label={`${roleLabel} invite link`}
            actions={
              <Button
                variant="ghost"
                className="text-destructive"
                aria-label={`Disable ${roleLabel.toLowerCase()} invite link`}
                disabled={setInvite.isPending}
                onClick={() => setDisableOpen(true)}
              >
                Disable
              </Button>
            }
          />
          <ConfirmActionDialog
            open={disableOpen}
            onOpenChange={setDisableOpen}
            title={`Disable the ${roleLabel.toLowerCase()} link?`}
            description={`Anyone you've shared it with can no longer use it to become ${roleNoun}. You can create a new link any time.`}
            confirmLabel="Disable link"
            pendingLabel="Disabling..."
            isPending={setInvite.isPending}
            onConfirm={async () => {
              await run(false);
              setDisableOpen(false);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * The "Add staff" top-bar action for the tournament Staff section: opens the
 * candidate-picker dialog. Lifted out of the staff list so it lives in the
 * page's top bar. Render only for the tournament host.
 * @returns The top-bar button and its dialog.
 */
export function TournamentStaffAddButton({ tournamentId }: { tournamentId: string }) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <PageTopBarPrimaryButton onClick={() => setAddOpen(true)}>
        <PlusIcon />
        Add staff
      </PageTopBarPrimaryButton>
      <AddStaffDialog tournamentId={tournamentId} open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

function AddStaffDialog({
  tournamentId,
  open,
  onOpenChange,
}: {
  tournamentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addStaff = useAddTournamentStaff();
  // Fetch only while open so the page never suspends on the candidate list.
  const { data: candidates, isLoading } = useTournamentStaffCandidates(tournamentId, open);
  const [role, setRole] = useState<TournamentStaffRole>("judge");
  const [userId, setUserId] = useState("");

  const items = (candidates?.items ?? []).map((candidate) => ({
    value: candidate.userId,
    label: `${candidate.name ?? "Unnamed player"}${
      candidate.source === "participant" ? " · participant" : ""
    }`,
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setUserId("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogForm
          onSubmit={async () => {
            if (!userId) {
              return;
            }
            try {
              await addStaff.mutateAsync({ id: tournamentId, userId, role });
              onOpenChange(false);
            } catch {
              // Reported by the global mutation error toast (see reportMutationError).
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Add staff</DialogTitle>
            <DialogDescription>
              Pick someone from the linked group or the roster, then choose a role. To add someone
              who isn&apos;t listed, share a staff invite link instead.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <Select
                items={ROLE_ITEMS}
                value={role}
                onValueChange={(value) => value && setRole(value as TournamentStaffRole)}
              >
                <SelectTrigger aria-label="Role">
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-sm">
                Organizers manage the event. Judges run deck check.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Person</Label>
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : items.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No one to add yet. Group members and account-linked participants show up here, or
                  share a staff invite link below.
                </p>
              ) : (
                <Select
                  items={items}
                  value={userId}
                  onValueChange={(value) => value && setUserId(value)}
                >
                  <SelectTrigger aria-label="Person">
                    <SelectValue placeholder="Choose a person" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!userId || addStaff.isPending}>
              Add
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
