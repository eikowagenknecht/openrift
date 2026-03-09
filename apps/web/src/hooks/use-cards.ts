import type { Card, PricesData, RiftboundContent } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import type { SetInfo } from "@/components/cards/card-grid";

type HealthStatus = "db_unreachable" | "db_not_migrated" | "db_empty" | null;

export class ApiError extends Error {
  healthStatus: HealthStatus;

  constructor(message: string, healthStatus: HealthStatus = null) {
    super(message);
    this.name = "ApiError";
    this.healthStatus = healthStatus;
  }
}

interface UseCardsResult {
  allCards: Card[];
  setInfoList: SetInfo[];
  isLoading: boolean;
  error: Error | null;
}

async function checkHealth(): Promise<HealthStatus> {
  try {
    const res = await fetch(`/api/health`);
    const data = (await res.json()) as { status: string };
    if (
      data.status === "db_unreachable" ||
      data.status === "db_not_migrated" ||
      data.status === "db_empty"
    ) {
      return data.status;
    }
  } catch {
    // Health endpoint itself is unreachable — no extra info to surface
  }
  return null;
}

async function fetchCards(): Promise<RiftboundContent> {
  const res = await fetch(`/api/cards`);
  if (!res.ok) {
    const healthStatus = await checkHealth();
    throw new ApiError(`Failed to fetch cards: ${res.status}`, healthStatus);
  }
  return (await res.json()) as RiftboundContent;
}

async function fetchPrices(): Promise<PricesData> {
  const res = await fetch(`/api/prices`);
  if (!res.ok) {
    const healthStatus = await checkHealth();
    throw new ApiError(`Failed to fetch prices: ${res.status}`, healthStatus);
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

  const isEmpty = cardsQuery.data !== undefined && cardsQuery.data.sets.length === 0;
  const isLoading = !isEmpty && (cardsQuery.isLoading || pricesQuery.isLoading);
  const error = isEmpty
    ? new ApiError("No cards available", "db_empty")
    : (cardsQuery.error ?? pricesQuery.error);

  const allCards = cardsQuery.data
    ? cardsQuery.data.sets.flatMap((set) =>
        set.cards.map((card) => {
          const price = pricesQuery.data?.cards[card.id];
          return price ? { ...card, price } : card;
        }),
      )
    : [];

  const setInfoList: SetInfo[] = cardsQuery.data
    ? cardsQuery.data.sets.map((s) => ({
        name: s.name,
        code: s.id,
      }))
    : [];

  return { allCards, setInfoList, isLoading, error: error as Error | null };
}
