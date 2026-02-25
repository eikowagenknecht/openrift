import type { Card, PricesData, RiftboundContent } from "@openrift/shared";
import { flattenWithVariants } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import type { SetInfo } from "@/components/cards/CardGrid";

interface UseCardsResult {
  allCards: Card[];
  setInfoList: SetInfo[];
  isLoading: boolean;
  error: Error | null;
}

// Preview deployments (e.g. Cloudflare Workers) have no backend — fall back
// to a shared API via VITE_API_FALLBACK_URL when the hostname matches
// VITE_PREVIEW_HOSTS (comma-separated suffix patterns like ".workers.dev").
const PREVIEW_HOSTS = (import.meta.env.VITE_PREVIEW_HOSTS ?? "").split(",").filter(Boolean);
const API_FALLBACK = import.meta.env.VITE_API_FALLBACK_URL ?? "";
const API_BASE = PREVIEW_HOSTS.some((h) => location.hostname.endsWith(h)) ? API_FALLBACK : "";

async function fetchCards(): Promise<RiftboundContent> {
  const res = await fetch(`${API_BASE}/api/cards`);
  if (!res.ok) {
    throw new Error(`Failed to fetch cards: ${res.status}`);
  }
  return res.json() as Promise<RiftboundContent>;
}

async function fetchPrices(): Promise<PricesData> {
  const res = await fetch(`${API_BASE}/api/prices`);
  if (!res.ok) {
    throw new Error(`Failed to fetch prices: ${res.status}`);
  }
  return res.json() as Promise<PricesData>;
}

export function useCards(): UseCardsResult {
  const cardsQuery = useQuery({
    queryKey: ["cards"],
    queryFn: fetchCards,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const pricesQuery = useQuery({
    queryKey: ["prices"],
    queryFn: fetchPrices,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const isLoading = cardsQuery.isLoading || pricesQuery.isLoading;
  const error = cardsQuery.error ?? pricesQuery.error;

  const allCards = cardsQuery.data
    ? flattenWithVariants(cardsQuery.data).map((card) => {
        const price = pricesQuery.data?.cards[card.id];
        return price ? { ...card, price } : card;
      })
    : [];

  const setInfoList: SetInfo[] = cardsQuery.data
    ? cardsQuery.data.sets.map((s) => ({
        name: s.name,
        code: s.cards[0]?.id.replace(/-.*$/, "") ?? s.id,
      }))
    : [];

  return { allCards, setInfoList, isLoading, error: error as Error | null };
}
