import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

/** A single row from a reference table. */
export interface EnumRow {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: boolean;
}

/** All reference table data, keyed by table name. */
export type EnumsResponse = Record<string, EnumRow[]>;

export const enumsQueryOptions = queryOptions({
  queryKey: queryKeys.enums.all,
  queryFn: async () => {
    const res = await client.api.v1.enums.$get();
    assertOk(res);
    return (await res.json()) as EnumsResponse;
  },
  staleTime: 60 * 60 * 1000, // 1 hour — enums rarely change
  refetchOnWindowFocus: false,
});

/**
 * Returns all reference table enums.
 *
 * @returns Map of table name → sorted enum rows.
 */
export function useEnums(): EnumsResponse {
  const { data } = useSuspenseQuery(enumsQueryOptions);
  return data;
}
