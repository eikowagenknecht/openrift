import type { InferRequestType } from "hono/client";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export type UploadCandidatesBody = InferRequestType<
  (typeof client.api.v1.admin.cards)["upload"]["$post"]
>["json"];

export function useDeletePrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async (imageId: string) => {
      const res = await client.api.v1.admin["cards"]["printing-images"][":imageId"].$delete({
        param: { imageId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useActivatePrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async ({ imageId, active }: { imageId: string; active: boolean }) => {
      const res = await client.api.v1.admin["cards"]["printing-images"][":imageId"].activate.$post({
        param: { imageId },
        json: { active },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useRehostPrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async (imageId: string) => {
      const res = await client.api.v1.admin["cards"]["printing-images"][":imageId"].rehost.$post({
        param: { imageId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useUnrehostPrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async (imageId: string) => {
      const res = await client.api.v1.admin["cards"]["printing-images"][":imageId"].unrehost.$post({
        param: { imageId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAddImageFromUrl() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      printingId,
      ...body
    }: {
      printingId: string;
      url: string;
      source?: string;
      mode?: "main" | "additional";
    }) => {
      const res = await client.api.v1.admin["cards"].printing[":printingId"]["add-image-url"].$post(
        {
          param: { printingId },
          json: body,
        },
      );
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useUploadPrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      printingId,
      file,
      provider,
      mode,
    }: {
      printingId: string;
      file: File;
      provider?: string;
      mode?: "main" | "additional";
    }) => {
      const res = await client.api.v1.admin["cards"].printing[":printingId"]["upload-image"].$post({
        param: { printingId },
        form: { file, provider, mode },
      });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useSetCandidatePrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      candidatePrintingId,
      mode,
    }: {
      candidatePrintingId: string;
      mode: "main" | "additional";
    }) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"][":id"][
        "set-image"
      ].$post({
        param: { id: candidatePrintingId },
        json: { mode },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useUploadCandidates() {
  return useMutationWithInvalidation({
    mutationFn: async (payload: UploadCandidatesBody) => {
      const res = await client.api.v1.admin["cards"].upload.$post({
        json: payload,
      });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}
