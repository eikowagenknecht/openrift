import type { Currency } from "@openrift/shared";
import { CURRENCIES } from "@openrift/shared";
import { RotateCcwIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDisplayStore } from "@/stores/display-store";

const CURRENCY_LABEL: Record<Currency, string> = {
  EUR: "Euro (EUR)",
  USD: "US Dollar (USD)",
};

const CURRENCY_ITEMS: { value: Currency; label: string }[] = CURRENCIES.map((value) => ({
  value,
  label: CURRENCY_LABEL[value],
}));

export function TradingSection() {
  const defaultCurrency = useDisplayStore((s) => s.defaultCurrency);
  const setDefaultCurrency = useDisplayStore((s) => s.setDefaultCurrency);
  const overrideSet = useDisplayStore((s) => s.overrides.defaultCurrency) !== null;
  const resetPreference = useDisplayStore((s) => s.resetPreference);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Trading</CardTitle>
            <CardDescription>
              Defaults for new wishlists and tradelists. You can override the currency on each list.
            </CardDescription>
          </div>
          {overrideSet && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => resetPreference("defaultCurrency")}
                    className="text-muted-foreground hover:text-foreground relative z-10 p-1 transition-colors"
                    aria-label="Reset default currency"
                  />
                }
              >
                <RotateCcwIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Reset to default</TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Label htmlFor="pref-default-currency" className="font-normal">
            Default currency
          </Label>
          <Select
            items={CURRENCY_ITEMS}
            value={defaultCurrency}
            onValueChange={(value) => {
              if (CURRENCIES.includes(value as Currency)) {
                setDefaultCurrency(value as Currency);
              }
            }}
          >
            <SelectTrigger id="pref-default-currency" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCY_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
