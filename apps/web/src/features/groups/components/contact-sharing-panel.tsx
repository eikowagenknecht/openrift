import { CONTACT_METHOD_LABELS } from "@openrift/shared/contact-methods";
import type { FriendGroupDetailResponse } from "@openrift/shared/types/api/friend-group";
import { Link } from "@tanstack/react-router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useContactMethods } from "@/features/account/hooks/use-contact-methods";
import { useUpdateGroupContactReveal } from "@/features/groups/hooks/use-friend-group-mutations";
import { useRequiredUserId } from "@/lib/auth-session";

export function ContactSharingPanel({
  data,
  slug,
}: {
  data: FriendGroupDetailResponse;
  slug: string;
}) {
  const viewerId = useRequiredUserId();
  const { contactMethods } = useContactMethods();
  const reveal = useUpdateGroupContactReveal();

  const self = data.members.find((member) => member.userId === viewerId);
  const revealedIds = new Set((self?.contactMethods ?? []).map((method) => method.id));

  function toggle(methodId: string, next: boolean) {
    const ids = new Set(revealedIds);
    if (next) {
      ids.add(methodId);
    } else {
      ids.delete(methodId);
    }
    reveal.mutate({ slug, userId: viewerId, contactMethodIds: [...ids] });
  }

  return (
    <Card id="contacts" className="scroll-mt-28">
      <CardHeader>
        <CardTitle>Your contacts in this group</CardTitle>
        <CardDescription>
          Shown next to your name on the Members and Trades pages.{" "}
          <Link to="/profile" hash="contacts" className="underline">
            Edit them in your profile
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {contactMethods.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            You haven&apos;t added any contact methods yet.
          </p>
        ) : (
          contactMethods.map((method) => (
            <Label
              key={method.id}
              className="flex items-center gap-3 font-normal"
              htmlFor={`reveal-${method.id}`}
            >
              <Checkbox
                id={`reveal-${method.id}`}
                checked={revealedIds.has(method.id)}
                onCheckedChange={(checked) => toggle(method.id, checked === true)}
                disabled={reveal.isPending}
              />
              <span className="text-muted-foreground text-sm">
                {CONTACT_METHOD_LABELS[method.type]}
              </span>
              <span className="truncate">{method.value}</span>
            </Label>
          ))
        )}
      </CardContent>
    </Card>
  );
}
