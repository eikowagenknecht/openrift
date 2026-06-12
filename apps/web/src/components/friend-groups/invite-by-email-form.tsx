import { UsersIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInviteFriendByEmail } from "@/hooks/use-friend-groups";

// Invite-by-email field for the group manage page, extracted so the
// mutation-error path is unit-testable in isolation.
export function InviteByEmailForm({ slug }: { slug: string }) {
  const invite = useInviteFriendByEmail();
  const [inviteEmail, setInviteEmail] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="fg-invite-email" className="flex items-center gap-2">
        <UsersIcon className="size-4" />
        Invite by email
      </Label>
      <div className="flex gap-2">
        <Input
          id="fg-invite-email"
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="friend@example.com"
        />
        <Button
          onClick={() => {
            // mutate, not mutateAsync: failures are already surfaced by the
            // global mutation onError toast (lib/query-client.ts), and an
            // awaited mutateAsync rejection would escape this handler as an
            // unhandled rejection.
            invite.mutate(
              { slug, email: inviteEmail.trim() },
              { onSuccess: () => setInviteEmail("") },
            );
          }}
          disabled={!inviteEmail || invite.isPending}
        >
          Send invite
        </Button>
      </div>
    </div>
  );
}
