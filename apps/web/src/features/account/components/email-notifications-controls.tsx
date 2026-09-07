import type { TradeRequestEmailCadence } from "@openrift/shared/types/api/preferences";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useEmailNotifications } from "@/features/account/hooks/use-email-notifications";

const CADENCE_OPTIONS: { value: TradeRequestEmailCadence; label: string }[] = [
  { value: "instant", label: "Instant" },
  { value: "5min", label: "Every 5 minutes" },
  { value: "15min", label: "Every 15 minutes" },
  { value: "30min", label: "Every 30 minutes" },
  { value: "60min", label: "Every hour" },
];

export function EmailNotificationsControls() {
  const { gates, isLoading, isSaving, setChannel, setCadence } = useEmailNotifications();
  const disabled = isLoading || isSaving;

  return (
    <div className="mt-6 space-y-4 border-t pt-6">
      <div>
        <p className="font-medium">Email notifications</p>
        <p className="text-muted-foreground">
          Only about your trading activity. Every email has one-click unsubscribe.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="pref-email-trade-requests" className="font-normal">
              Trade requests
            </Label>
            <p className="text-muted-foreground">When someone requests a trade with you.</p>
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
          <Label htmlFor="pref-email-trade-status" className="font-normal">
            Trade updates
          </Label>
          <p className="text-muted-foreground">
            When your trade is accepted, declined, or cancelled. Same frequency as trade requests.
          </p>
        </div>
        <Switch
          id="pref-email-trade-status"
          checked={gates.tradeStatus}
          disabled={disabled}
          onCheckedChange={(checked: boolean) => setChannel("tradeStatus", checked)}
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
