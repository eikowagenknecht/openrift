import type { InferRequestType } from "hono/client";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export type AcceptNewCardBody = InferRequestType<
  (typeof client.api.v1.admin.cards.new)[":name"]["accept"]["$post"]
>["json"];

export type AcceptPrintingBody = InferRequestType<
  (typeof client.api.v1.admin.cards)[":cardId"]["accept-printing"]["$post"]
>["json"];

export function useCheckCandidateCard() {
  return useMutationWithInvalidation({
    mutationFn: async (candidateCardId: string) => {
      const res = await client.api.v1.admin["cards"][":candidateCardId"].check.$post({
        param: { candidateCardId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useUncheckCandidateCard() {
  return useMutationWithInvalidation({
    mutationFn: async (candidateCardId: string) => {
      const res = await client.api.v1.admin["cards"][":candidateCardId"].uncheck.$post({
        param: { candidateCardId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCheckAllCandidateCards() {
  return useMutationWithInvalidation({
    mutationFn: async (cardId: string) => {
      const res = await client.api.v1.admin["cards"][":cardId"]["check-all"].$post({
        param: { cardId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCheckCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"][":id"].check.$post({
        param: { id },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useUncheckCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"][":id"].uncheck.$post({
        param: { id },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCheckAllCandidatePrintings() {
  return useMutationWithInvalidation({
    mutationFn: async ({ printingId, extraIds }: { printingId?: string; extraIds?: string[] }) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"]["check-all"].$post({
        json: { printingId, extraIds },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useRenameCard() {
  return useMutationWithInvalidation({
    mutationFn: async ({ cardId, newId }: { cardId: string; newId: string }) => {
      const res = await client.api.v1.admin["cards"][":cardId"].rename.$post({
        param: { cardId },
        json: { newId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAcceptCardField() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      cardId,
      field,
      value,
      source = "manual",
    }: {
      cardId: string;
      field: string;
      value: unknown;
      source?: "provider" | "manual";
    }) => {
      const res = await client.api.v1.admin["cards"][":cardId"]["accept-field"].$post({
        param: { cardId },
        json: { field, value, source },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAcceptPrintingField() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      printingId,
      field,
      value,
      source = "manual",
    }: {
      printingId: string;
      field: string;
      value: unknown;
      source?: "provider" | "manual";
    }) => {
      const res = await client.api.v1.admin["cards"].printing[":printingId"]["accept-field"].$post({
        param: { printingId },
        json: { field, value, source },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAcceptNewCard() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      name,
      cardFields,
    }: {
      name: string;
      cardFields: AcceptNewCardBody["cardFields"];
    }) => {
      const res = await client.api.v1.admin["cards"].new[":name"].accept.$post({
        param: { name },
        json: { cardFields },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAcceptGallery() {
  return useMutationWithInvalidation({
    mutationFn: async (name: string) => {
      const res = await client.api.v1.admin["cards"].new[":name"]["accept-gallery"].$post({
        param: { name },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useLinkCard() {
  return useMutationWithInvalidation({
    mutationFn: async ({ name, cardId }: { name: string; cardId: string }) => {
      const res = await client.api.v1.admin["cards"].new[":name"].link.$post({
        param: { name },
        json: { cardId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useReassignCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async ({ id, fields }: { id: string; fields: Record<string, unknown> }) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"][":id"].$patch({
        param: { id },
        json: fields,
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useDeleteCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"][":id"].$delete({
        param: { id },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCopyCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async ({ id, printingId }: { id: string; printingId: string }) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"][":id"].copy.$post({
        param: { id },
        json: { printingId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useLinkCandidatePrintings() {
  return useMutationWithInvalidation({
    mutationFn: async (payload: { candidatePrintingIds: string[]; printingId: string | null }) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"].link.$post({
        json: payload,
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useDeletePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async (printingId: string) => {
      const res = await client.api.v1.admin["cards"].printing[":printingId"].$delete({
        param: { printingId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAcceptPrintingGroup() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      cardId,
      printingFields,
      candidatePrintingIds,
    }: {
      cardId: string;
      printingFields: AcceptPrintingBody["printingFields"];
      candidatePrintingIds: string[];
    }) => {
      const fields = { ...printingFields };
      if (typeof fields.collectorNumber === "string") {
        fields.collectorNumber = Number(fields.collectorNumber);
      }
      const res = await client.api.v1.admin["cards"][":cardId"]["accept-printing"].$post({
        param: { cardId },
        json: { printingFields: fields, candidatePrintingIds },
      });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCheckProvider() {
  return useMutationWithInvalidation({
    mutationFn: async (provider: string) => {
      const res = await client.api.v1.admin["cards"]["by-provider"][":provider"].check.$post({
        param: { provider },
      });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useDeleteProvider() {
  return useMutationWithInvalidation({
    mutationFn: async (provider: string) => {
      const res = await client.api.v1.admin["cards"]["by-provider"][":provider"].$delete({
        param: { provider },
      });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}
