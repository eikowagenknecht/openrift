import type { AdminPrintingCitation } from "@openrift/shared";
import { adminPrintingCitationsContract } from "@openrift/shared/contracts/admin/printing-citations";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// Source citations for promo printings (migration 258), full-admin only. Every
// write invalidates the public catalog reads as well as the admin list: a
// citation is part of the catalog response, so the `/catalog` bundle and the
// card, promo, and set pages all go stale the moment one lands.
const PUBLIC_CATALOG_KEYS = [
  queryKeys.catalog.all,
  queryKeys.promos.all,
  queryKeys.sets.all,
] as const;

const fetchPrintingCitations = createServerFn({ method: "GET" })
  .validator((input: { printingId: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<{ citations: AdminPrintingCitation[] }> =>
    apiOrpcClient(adminPrintingCitationsContract, context.cookie).list({
      printingId: data.printingId,
    }),
  );

/**
 * One printing's citations. A plain query, not a suspense one: the editor lives
 * inside a printing card that only mounts when the card is expanded, so no
 * route loader warms it and there is no boundary to suspend against. That
 * mounting is also what scopes the fetch — a card page listing twenty printings
 * loads citations only for the rows the admin opens.
 *
 * @param printingId - The printing whose citations to load.
 * @returns The query holding the citation list.
 */
export function useAdminPrintingCitations(printingId: string) {
  return useQuery({
    queryKey: queryKeys.admin.printingCitations(printingId),
    queryFn: () => fetchPrintingCitations({ data: { printingId } }),
    staleTime: 5 * 60 * 1000,
  });
}

type CreatePrintingCitationInput = ContractInput<typeof adminPrintingCitationsContract, "create">;

const createPrintingCitationFn = createServerFn({ method: "POST" })
  .validator((input: CreatePrintingCitationInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<AdminPrintingCitation> =>
    apiOrpcClient(adminPrintingCitationsContract, context.cookie).create({
      printingId: data.printingId,
      label: data.label,
      sourceUrl: data.sourceUrl,
    }),
  );

/**
 * Adds a citation to a printing.
 *
 * @returns The mutation; resolves with the created citation row.
 */
export function useCreatePrintingCitation() {
  return useMutationWithInvalidation<AdminPrintingCitation, CreatePrintingCitationInput>({
    mutationFn: (vars) => createPrintingCitationFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.admin.printingCitations(vars.printingId),
      ...PUBLIC_CATALOG_KEYS,
    ],
  });
}

const deletePrintingCitationFn = createServerFn({ method: "POST" })
  .validator((input: { printingId: string; citationId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminPrintingCitationsContract, context.cookie).remove({
      printingId: data.printingId,
      citationId: data.citationId,
    });
  });

/**
 * Removes a citation from a printing.
 *
 * @returns The mutation.
 */
export function useDeletePrintingCitation() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { printingId: string; citationId: string }) =>
      deletePrintingCitationFn({ data: vars }),
    invalidates: (vars) => [
      queryKeys.admin.printingCitations(vars.printingId),
      ...PUBLIC_CATALOG_KEYS,
    ],
  });
}
