import { useQuery } from "@tanstack/react-query";

async function fetchOwnedCount(): Promise<Record<string, number>> {
  const res = await fetch("/api/copies/count", { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch owned count: ${res.status}`);
  }
  return res.json() as Promise<Record<string, number>>;
}

export function useOwnedCount(enabled: boolean) {
  return useQuery({
    queryKey: ["ownedCount"],
    queryFn: fetchOwnedCount,
    enabled,
    staleTime: 60_000,
  });
}
