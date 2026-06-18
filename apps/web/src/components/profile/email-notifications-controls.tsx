import type { TradeRequestEmailCadence } from "@openrift/shared";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useEmailNotifications } from "@/hooks/use-email-notifications";

/** Cadence presets, ordered fastest-first, shown in the frequency dropdown. */
const CADENCE_OPTIONS: { value: TradeRequestEmailCadence; label: string }[] = [
  { value: "instant", label: "Instant" },
  { value: "5min", label: "Every 5 minutes" },
  { value: "15min", label: "Every 15 minutes" },
  { value: "30min", label: "Every 30 minutes" },
  { value: "60min", label: "Every hour" },
];

/**
 * The ADR-030 email-notification controls, shown inside the Trading section.
 * Trade-request emails are on by default with a per-user delivery cadence; the
 * daily match digest is opt-in.
 * @returns The email-notifications group (request toggle + cadence, digest toggle).
 */
export function EmailNotificationsControls() {
  const { gates, isLoading, isSaving, setChannel, setCadence } = useEmailNotifications();
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

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="pref-email-trade-requests" className="font-normal">
              Trade requests
            </Label>
            <p className="text-muted-foreground">
              Get notified when someone requests a trade, so you don&apos;t miss it before it
              expires. Choose how often these emails arrive.
            </p>
          </div>
          <Switch
            id="pref-email-trade-requests"
            checked={gates.tradeRequests}
            disabled={disabled}
            onCheckedChange={(checked: boolean) => setChannel("tradeRequests", checked)}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label
            htmlFor="pref-email-trade-request-cadence"
            className="text-muted-foreground font-normal"
          >
            Frequency
          </Label>
          <Select
            value={gates.tradeRequestCadence}
            onValueChange={(value) => {
              if (value) {
                setCadence(value as TradeRequestEmailCadence);
              }
            }}
            items={CADENCE_OPTIONS}
          >
            <SelectTrigger
              id="pref-email-trade-request-cadence"
              className="w-44"
              disabled={disabled || !gates.tradeRequests}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CADENCE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
