import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useEmailNotifications } from "@/hooks/use-email-notifications";

/**
 * The ADR-030 email-notification toggles, shown inside the Trading section.
 * Trade-request emails are on by default; the daily match digest is opt-in.
 * @returns The two-switch email-notifications group.
 */
export function EmailNotificationsControls() {
  const { gates, isLoading, isSaving, setChannel } = useEmailNotifications();
  // Disable while the saved values are loading (so we never show interactive but
  // wrong/default positions) and during a save. The read is a fast client-only
  // query (see useEmailNotifications), so this can't get stuck on like the old
  // SSR-dehydrated shared query did.
  const disabled = isLoading || isSaving;

  return (
    <div className="mt-6 space-y-4 border-t pt-6">
      <div>
        <p className="font-medium">Email notifications</p>
        <p className="text-muted-foreground">
          We only email about your trading activity, and every email has a one-click unsubscribe.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="pref-email-trade-requests" className="font-normal">
            Trade requests
          </Label>
          <p className="text-muted-foreground">
            Get an email the moment someone requests a trade, so you don&apos;t miss it before it
            expires.
          </p>
        </div>
        <Switch
          id="pref-email-trade-requests"
          checked={gates.tradeRequests}
          disabled={disabled}
          onCheckedChange={(checked: boolean) => setChannel("tradeRequests", checked)}
        />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="pref-email-trade-matches" className="font-normal">
            Daily match digest
          </Label>
          <p className="text-muted-foreground">
            A once-a-day summary of new cards your groups have that are on your wishlist.
          </p>
        </div>
        <Switch
          id="pref-email-trade-matches"
          checked={gates.tradeMatches}
          disabled={disabled}
          onCheckedChange={(checked: boolean) => setChannel("tradeMatches", checked)}
        />
      </div>
    </div>
  );
}
