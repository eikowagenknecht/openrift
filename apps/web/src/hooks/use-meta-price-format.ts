import { compactFormatterForMarketplace } from "@/lib/format";
import { useDisplayStore } from "@/stores/display-store";

export type MetaPriceFormat = (value?: number | null) => string;

export function useMetaPriceFormat(): MetaPriceFormat {
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");
  return compactFormatterForMarketplace(marketplace);
}
