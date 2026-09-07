import type { OrganizationRole } from "@openrift/shared";
import { useState } from "react";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { OrgDeckCheckKeysSection } from "@/components/deck-check/deck-check-keys-section";
import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
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
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAddOrganizationMember,
  useOrganization,
  useRemoveOrganizationMember,
  useUpdateOrganizationMemberRole,
} from "@/hooks/use-organizations";
import { cn, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";

const ROLE_LABEL: Record<OrganizationRole, string> = {
  owner: "Owner",
  manager: "Manager",
  judge: "Judge",
};

// The server enforces the last-owner guard, not this list.
const MEMBER_ROLE_ITEMS = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "judge", label: "Judge" },
] satisfies { value: OrganizationRole; label: string }[];

export function OrganizationPage({ id }: { id: string }) {
  const { data } = useOrganization(id);
  const addMember = useAddOrganizationMember();
  const removeMember = useRemoveOrganizationMember();
  const updateMemberRole = useUpdateOrganizationMemberRole();

  const isOwner = data.viewerRole === "owner";
  const canManage = data.viewerRole === "owner" || data.viewerRole === "manager";

  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationRole>("manager");
  const [memberToRemove, setMemberToRemove] = useState<{ userId: string; name: string } | null>(
    null,
  );

  // Owners may grant any role; managers can't hand out (or revoke) ownership.
  const roleItems = isOwner
    ? MEMBER_ROLE_ITEMS
    : MEMBER_ROLE_ITEMS.filter((item) => item.value !== "owner");

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch {
      // Reported by the global mutation onError toast; swallowed so
      // `void run(...)` call sites don't surface an uncaught promise.
    }
  }

  async function handleAddMember() {
    await run(() => addMember.mutateAsync({ id, email: email.trim(), role }));
    setAddOpen(false);
    setEmail("");
  }

  async function handleRemoveMember() {
    if (!memberToRemove) {
      return;
    }
    await run(() => removeMember.mutateAsync({ id, userId: memberToRemove.userId }));
    setMemberToRemove(null);
  }

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>{data.name}</PageTopBarTitle>
          <Badge variant="outline" className="shrink-0 font-mono">
            {data.slug}
          </Badge>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, "flex flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}>
        {data.description ? <PageDescription>{data.description}</PageDescription> : null}

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Members</h2>
            {canManage ? (
              <Button variant="secondary" onClick={() => setAddOpen(true)}>
                Add member
              </Button>
            ) : null}
          </div>
          <ul className="divide-border divide-y rounded-lg border">
            {data.members.map((member) => (
              <li
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{member.name ?? member.userId}</span>
                  {isOwner ? (
                    <Select
                      items={MEMBER_ROLE_ITEMS}
                      value={member.role}
                      disabled={updateMemberRole.isPending}
                      onValueChange={(value) => {
                        if (
                          (value === "owner" || value === "manager" || value === "judge") &&
                          value !== member.role
                        ) {
                          void run(() =>
                            updateMemberRole.mutateAsync({
                              id,
                              userId: member.userId,
                              role: value,
                            }),
                          );
                        }
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={`Role for ${member.name ?? member.userId}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEMBER_ROLE_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline">{ROLE_LABEL[member.role]}</Badge>
                  )}
                </span>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={removeMember.isPending}
                    onClick={() =>
                      setMemberToRemove({
                        userId: member.userId,
                        name: member.name ?? member.userId,
                      })
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {canManage ? (
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">Integrations</h2>
            <OrgDeckCheckKeysSection orgId={id} enabled={canManage} />
          </section>
        ) : null}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogForm onSubmit={() => void handleAddMember()}>
            <DialogHeader>
              <DialogTitle>Add member</DialogTitle>
              <DialogDescription>
                Add an account by its email address. Owners can grant any role.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="org-member">Email</Label>
                <Input
                  id="org-member"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="member@example.com"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Role</Label>
                <Select
                  items={roleItems}
                  value={role}
                  onValueChange={(value) => value && setRole(value as OrganizationRole)}
                >
                  <SelectTrigger aria-label="Role">
                    <SelectValue placeholder="Choose a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!email.trim() || addMember.isPending}>
                Add
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMemberToRemove(null);
          }
        }}
        title="Remove member"
        description={
          memberToRemove
            ? `Remove ${memberToRemove.name} from this organization? They will lose access to its tournaments.`
            : ""
        }
        confirmLabel="Remove"
        pendingLabel="Removing..."
        isPending={removeMember.isPending}
        onConfirm={() => void handleRemoveMember()}
      />
    </>
  );
}
