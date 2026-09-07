import type { AdminPrintingCitation } from "@openrift/shared";
import { adminPrintingCitationsContract } from "@openrift/shared/contracts/admin/printing-citations";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// A citation is part of the catalog response, so every write must also
// invalidate the public catalog reads, not just the admin list.
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

/** Plain, not suspense: the editor mounts inside an expanded printing card, with no loader to warm it. */
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
