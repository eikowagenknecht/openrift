import type { TournamentDetailResponse, TournamentStaffRole } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { EllipsisVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function TournamentStaffTab({ detail }: { detail: TournamentDetailResponse }) {
  const host = isTournamentHost(detail.myRoles);
  const removeStaff = useRemoveTournamentStaff();

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {detail.staff.length === 0 ? (
        <p className="text-muted-foreground">No staff yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {detail.staff.map((member) => (
            <li
              key={`${member.userId}-${member.source}-${member.role}`}
              className="bg-card flex items-center gap-3 rounded-md border p-3"
            >
              <UserAvatar name={member.name} className="size-9 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{member.name ?? member.userId}</span>
                  <Badge variant="outline">{STAFF_ROLE_LABEL[member.role]}</Badge>
                  {member.source === "organization" && member.orgRole ? (
                    <Badge variant="secondary">
                      {ORG_ROLE_LABEL[member.orgRole]} · {detail.host.displayName}
                    </Badge>
                  ) : null}
                </span>
              </span>
              {host && member.source === "grant" ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button size="sm" variant="ghost" aria-label="Staff actions" />}
                  >
                    <EllipsisVerticalIcon className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={removeStaff.isPending}
                      onClick={() =>
                        void run(() =>
                          removeStaff.mutateAsync({
                            id: detail.id,
                            userId: member.userId,
                            role: member.role,
                          }),
                        )
                      }
                    >
                      <Trash2Icon className="size-4" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          ))}
        </ul>
      )}

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

      {host ? <StaffInviteLinks detail={detail} /> : null}
    </div>
  );
}

/**
 * The host's reusable staff-invite links. One per role: anyone the host shares
 * the link with confirms while logged in to take the role, so no email or user
 * search is needed. Disabling retires the link (confirmed, since it breaks any
 * link already shared); creating again mints a fresh one.
 * @returns The invite-link controls for organizer and judge.
 */
function StaffInviteLinks({ detail }: { detail: TournamentDetailResponse }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Staff invite links</h2>
        <p className="text-muted-foreground text-sm">
          Share a link with someone to make them staff. They take the role by confirming while
          signed in. Disable a link to stop it working, then create a new one to share fresh.
        </p>
      </div>
      <StaffInviteRow id={detail.id} staffRole="organizer" token={detail.organizerInviteToken} />
      <StaffInviteRow id={detail.id} staffRole="judge" token={detail.judgeInviteToken} />
    </section>
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
  const url = token ? `${getSiteUrl()}/tournaments/staff-invite/${token}` : null;

  async function run(enabled: boolean) {
    try {
      await setInvite.mutateAsync({ id, role: staffRole, enabled });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{roleLabel} link</Label>
      {url ? (
        <>
          <div className="flex gap-2">
            <Input readOnly value={url} aria-label={`${roleLabel} invite link`} />
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                toast.success("Link copied");
              }}
            >
              Copy
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={setInvite.isPending}
              onClick={() => setDisableOpen(true)}
            >
              Disable link
            </Button>
          </div>
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
      ) : (
        <Button className="w-fit" disabled={setInvite.isPending} onClick={() => void run(true)}>
          Create link
        </Button>
      )}
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
        <DialogHeader>
          <DialogTitle>Add staff</DialogTitle>
          <DialogDescription>
            Pick someone from the linked group or the roster, then choose a role. To add someone who
            isn&apos;t listed, share a staff invite link instead.
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
          <Button
            disabled={!userId || addStaff.isPending}
            onClick={async () => {
              if (!userId) {
                return;
              }
              try {
                await addStaff.mutateAsync({ id: tournamentId, userId, role });
                onOpenChange(false);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Something went wrong");
              }
            }}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
