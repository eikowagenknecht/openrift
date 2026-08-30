import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useEmailNotifications } from "@/hooks/use-email-notifications";

/**
 * Group email settings. The join-request switch is shown to everyone rather
 * than only to group admins: anyone can create a group at any moment, and the
 * send side gates on membership anyway, so a stored preference on a non-admin
 * delivers nothing.
 * @returns The groups notifications card.
 */
export function GroupNotificationsSection() {
  const { gates, isLoading, isSaving, setChannel } = useEmailNotifications();
  // Same rule as the trading email controls: disabled while the saved values
  // load (so the switch never shows an interactive but wrong position) and
  // during a save.
  const disabled = isLoading || isSaving;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Groups</CardTitle>
        <CardDescription>
          Emails about your groups. Every email has one-click unsubscribe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="pref-email-group-join-requests" className="font-normal">
              Join requests
            </Label>
            <p className="text-muted-foreground">
              When someone follows your invite link and asks to join, with a link straight to the
              approve buttons.
            </p>
          </div>
          <Switch
            id="pref-email-group-join-requests"
            checked={gates.groupJoinRequests}
            disabled={disabled}
            onCheckedChange={(checked: boolean) => setChannel("groupJoinRequests", checked)}
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="pref-email-group-approvals" className="font-normal">
              Welcome to a group
            </Label>
            <p className="text-muted-foreground">
              When an admin approves your request to join, with what the group gets you and a link
              to choose what you share.
            </p>
          </div>
          <Switch
            id="pref-email-group-approvals"
            checked={gates.groupApprovals}
            disabled={disabled}
            onCheckedChange={(checked: boolean) => setChannel("groupApprovals", checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
