import type {
  DeskCardPrintingsOutput,
  DeskCreateInput,
  DeskCreateOutput,
  DeskGetOutput,
  DeskListOutput,
  DeskSetImageFaceInput,
  DeskUpdateInput,
} from "@openrift/shared/contracts/admin/printing-desk";
import { adminPrintingDeskContract } from "@openrift/shared/contracts/admin/printing-desk";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { catalogKeys, promosKeys } from "@/features/cards/lib/cards-query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export type DeskListMode = "mine" | "all";

const fetchDeskPrintings = createServerFn({ method: "GET" })
  .validator((input: { mode: DeskListMode }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeskListOutput> =>
    apiOrpcClient(adminPrintingDeskContract, context.cookie).list({ mode: data.mode }),
  );

const fetchDeskCardPrintings = createServerFn({ method: "GET" })
  .validator((input: { cardSlug: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeskCardPrintingsOutput> =>
    apiOrpcClient(adminPrintingDeskContract, context.cookie).cardPrintings({
      cardSlug: data.cardSlug,
    }),
  );

const fetchDeskPrinting = createServerFn({ method: "GET" })
  .validator((input: { printingId: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeskGetOutput> =>
    apiOrpcClient(adminPrintingDeskContract, context.cookie).get({ printingId: data.printingId }),
  );

export const deskPrintingsQueryOptions = (mode: DeskListMode) =>
  queryOptions({
    queryKey: adminKeys.printingDesk.list(mode),
    queryFn: () => fetchDeskPrintings({ data: { mode } }),
    staleTime: 60 * 1000,
  });

export const deskCardPrintingsQueryOptions = (cardSlug: string) =>
  queryOptions({
    queryKey: adminKeys.printingDesk.cardPrintings(cardSlug),
    queryFn: () => fetchDeskCardPrintings({ data: { cardSlug } }),
    staleTime: 60 * 1000,
  });

export const deskPrintingQueryOptions = (printingId: string) =>
  queryOptions({
    queryKey: adminKeys.printingDesk.printing(printingId),
    queryFn: () => fetchDeskPrinting({ data: { printingId } }),
    staleTime: 60 * 1000,
  });

/** Plain, not suspense: switching the list mode must not throw the whole page back to its pending state. */
export function useDeskPrintings(mode: DeskListMode) {
  return useQuery(deskPrintingsQueryOptions(mode));
}

export function useDeskCardPrintings(cardSlug: string) {
  return useSuspenseQuery(deskCardPrintingsQueryOptions(cardSlug));
}

export function useDeskPrinting(printingId: string) {
  return useSuspenseQuery(deskPrintingQueryOptions(printingId));
}

const createDeskPrintingFn = createServerFn({ method: "POST" })
  .validator((input: DeskCreateInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeskCreateOutput> =>
    apiOrpcClient(adminPrintingDeskContract, context.cookie).create(data),
  );

const updateDeskPrintingFn = createServerFn({ method: "POST" })
  .validator((input: DeskUpdateInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminPrintingDeskContract, context.cookie).update(data);
  });

const PUBLIC_CATALOG_KEYS = [catalogKeys.all, promosKeys.all, adminKeys.cards.all] as const;

export function useCreateDeskPrinting() {
  return useMutationWithInvalidation<DeskCreateOutput, DeskCreateInput>({
    mutationFn: (vars) => createDeskPrintingFn({ data: vars }),
    invalidates: [adminKeys.printingDesk.all, ...PUBLIC_CATALOG_KEYS],
  });
}

export function useUpdateDeskPrinting() {
  return useMutationWithInvalidation<void, DeskUpdateInput>({
    mutationFn: (vars) => updateDeskPrintingFn({ data: vars }),
    invalidates: [adminKeys.printingDesk.all, ...PUBLIC_CATALOG_KEYS],
  });
}

/** Omitted credit stays as it is, `null` clears it. */
export interface DeskUpdateImageInput {
  imageFileId: string;
  credit?: string | null;
}

const updateDeskImageFn = createServerFn({ method: "POST" })
  .validator((input: DeskUpdateImageInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminPrintingDeskContract, context.cookie).updateImage(data);
  });

export function useUpdateDeskImage() {
  return useMutationWithInvalidation<void, DeskUpdateImageInput>({
    mutationFn: (vars) => updateDeskImageFn({ data: vars }),
    invalidates: [adminKeys.printingDesk.all, ...PUBLIC_CATALOG_KEYS],
  });
}

const setDeskImageFaceFn = createServerFn({ method: "POST" })
  .validator((input: DeskSetImageFaceInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminPrintingDeskContract, context.cookie).setImageFace(data);
  });

export function useSetDeskImageFace() {
  return useMutationWithInvalidation<void, DeskSetImageFaceInput>({
    mutationFn: (vars) => setDeskImageFaceFn({ data: vars }),
    invalidates: [adminKeys.printingDesk.all, ...PUBLIC_CATALOG_KEYS],
  });
}
