import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useEmailNotifications } from "@/hooks/use-email-notifications";

export function AdminNotificationsSection() {
  const { gates, isLoading, isSaving, setChannel } = useEmailNotifications();
  const disabled = isLoading || isSaving;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin notifications</CardTitle>
        <CardDescription>
          Emails about the review queue. Only admins see these settings, and each admin chooses
          their own.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="pref-email-card-submissions" className="font-normal">
              New card submissions
            </Label>
            <p className="text-muted-foreground">
              Get an email each time someone submits a card through the contribution form, with a
              link straight to the review queue.
            </p>
          </div>
          <Switch
            id="pref-email-card-submissions"
            checked={gates.cardSubmissions}
            disabled={disabled}
            onCheckedChange={(checked: boolean) => setChannel("cardSubmissions", checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
