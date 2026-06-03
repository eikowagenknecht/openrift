import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { API_URL } from "@/lib/server-fns/api-url";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export interface UploadCandidatesBody {
  provider: string;
  candidates: Record<string, unknown>[];
}

// Defined locally to avoid `unknown` vs `{}` mismatch with server function JSON serialization.
// Fields use JSON-safe types that match what the API actually returns.
interface UploadCandidatesResponse {
  provider: string;
  newCards: number;
  removedCards: number;
  updates: number;
  unchanged: number;
  newPrintings: number;
  removedPrintings: number;
  printingUpdates: number;
  printingsUnchanged: number;
  errors: string[];
  newCardDetails: { name: string; shortCode: string | null }[];
  removedCardDetails: { name: string; shortCode: string | null }[];
  updatedCards: {
    name: string;
    shortCode: string | null;
    fields: { field: string; from: string; to: string }[];
  }[];
  newPrintingDetails: { name: string; shortCode: string | null }[];
  removedPrintingDetails: { name: string; shortCode: string | null }[];
  updatedPrintings: {
    name: string;
    shortCode: string | null;
    fields: { field: string; from: string; to: string }[];
  }[];
}

// ── Server functions ─────────────────────────────────────────────────────────

const deletePrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { imageId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards["printing-images"][":imageId"].$delete({
        param: encodeParams({ imageId: data.imageId }),
      }),
      "Couldn't delete printing image",
    );
  });

const activatePrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { imageId: string; active: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards["printing-images"][
        ":imageId"
      ].activate.$post({
        param: encodeParams({ imageId: data.imageId }),
        json: { active: data.active },
      }),
      "Couldn't activate printing image",
    );
  });

const rehostPrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { imageId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards["printing-images"][
        ":imageId"
      ].rehost.$post({
        param: encodeParams({ imageId: data.imageId }),
      }),
      "Couldn't rehost printing image",
    );
  });

const unrehostPrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { imageId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards["printing-images"][
        ":imageId"
      ].unrehost.$post({
        param: encodeParams({ imageId: data.imageId }),
      }),
      "Couldn't unrehost printing image",
    );
  });

type Rotation = 0 | 90 | 180 | 270;

const rotatePrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { imageId: string; rotation: Rotation }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards["printing-images"][
        ":imageId"
      ].rotate.$post({
        param: encodeParams({ imageId: data.imageId }),
        json: { rotation: data.rotation },
      }),
      "Couldn't rotate printing image",
    );
  });

const setNeedsTrimFn = createServerFn({ method: "POST" })
  .inputValidator((input: { imageId: string; needsTrim: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards["printing-images"][":imageId"][
        "set-needs-trim"
      ].$post({
        param: encodeParams({ imageId: data.imageId }),
        json: { needsTrim: data.needsTrim },
      }),
      "Couldn't update needs-trim",
    );
  });

const addImageFromUrlFn = createServerFn({ method: "POST" })
  .inputValidator((input: { printingId: string; url: string; mode?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards.printing[":printingId"][
        "add-image-url"
      ].$post({
        param: encodeParams({ printingId: data.printingId }),
        json: { url: data.url, mode: data.mode as "main" | "additional" | undefined },
      }),
      "Couldn't add image from URL",
    );
  });

const setCandidatePrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { candidatePrintingId: string; mode: "main" | "additional" }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards["candidate-printings"][":id"][
        "set-image"
      ].$post({
        param: encodeParams({ id: data.candidatePrintingId }),
        json: { mode: data.mode },
      }),
      "Couldn't set candidate printing image",
    );
  });

// TODO(sweep): keep on fetchApiJson — the /upload route response schema types the
// `updatedCards[].fields[].from/to` and `updatedPrintings[].fields[].from/to` as
// `z.unknown()`, but this fn is annotated as `UploadCandidatesResponse` (those
// fields typed as `string`). The hc-inferred body type (`unknown`) does not fit
// the concrete annotation, so callApiJson would surface a mismatch. Resolve in the
// sweep by aligning the local type with the route's `unknown` fields (or vice versa).
const uploadCandidatesFn = createServerFn({ method: "POST" })
  .inputValidator((input: UploadCandidatesBody) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<UploadCandidatesResponse>({
      errorTitle: "Couldn't upload candidates",
      cookie: context.cookie,
      path: "/api/v1/admin/cards/upload",
      method: "POST",
      body: data,
    }),
  );

// ── Hook exports ─────────────────────────────────────────────────────────────
//
// Image mutations operate on an imageId or printingId; the owning card slug
// isn't in the arguments. Callers on a card-detail page pass a narrower
// `invalidates` list; callers without context get the coarse default.

type Scope = readonly (readonly unknown[])[];
const defaultScope: Scope = [queryKeys.admin.cards.all];

export function useDeletePrintingImage(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async (imageId: string) => {
      await deletePrintingImageFn({ data: { imageId } });
    },
    invalidates,
  });
}

export function useActivatePrintingImage(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async ({ imageId, active }: { imageId: string; active: boolean }) => {
      await activatePrintingImageFn({ data: { imageId, active } });
    },
    invalidates,
  });
}

export function useRehostPrintingImage(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async (imageId: string) => {
      await rehostPrintingImageFn({ data: { imageId } });
    },
    invalidates,
  });
}

export function useUnrehostPrintingImage(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async (imageId: string) => {
      await unrehostPrintingImageFn({ data: { imageId } });
    },
    invalidates,
  });
}

export function useRotatePrintingImage(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async ({ imageId, rotation }: { imageId: string; rotation: Rotation }) => {
      await rotatePrintingImageFn({ data: { imageId, rotation } });
    },
    invalidates,
  });
}

export function useSetPrintingImageNeedsTrim(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async ({ imageId, needsTrim }: { imageId: string; needsTrim: boolean }) => {
      await setNeedsTrimFn({ data: { imageId, needsTrim } });
    },
    invalidates,
  });
}

export function useAddImageFromUrl(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: ({
      printingId,
      ...body
    }: {
      printingId: string;
      url: string;
      mode?: "main" | "additional";
    }) => addImageFromUrlFn({ data: { printingId, ...body } }),
    invalidates,
  });
}

const uploadPrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      printingId: string;
      fileName: string;
      fileType: string;
      fileBase64: string;
      mode?: string;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const fileBytes = Uint8Array.from(atob(data.fileBase64), (c) => c.codePointAt(0) ?? 0);
    const blob = new Blob([fileBytes], { type: data.fileType });
    const formData = new FormData();
    formData.append("file", blob, data.fileName);
    if (data.mode) {
      formData.append("mode", data.mode);
    }
    // FormData body — can't use fetchApi helper (it JSON.stringify's bodies).
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/printing/${encodeURIComponent(data.printingId)}/upload-image`,
      {
        method: "POST",
        headers: { cookie: context.cookie },
        body: formData,
      },
    );
    if (!res.ok) {
      throw new Error(`Upload printing image failed: ${res.status}`);
    }
    return res.json();
  });

export function useUploadPrintingImage(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async ({
      printingId,
      file,
      mode,
    }: {
      printingId: string;
      file: File;
      mode?: "main" | "additional";
    }) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      const CHUNK = 32_768;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCodePoint(...bytes.subarray(i, i + CHUNK));
      }
      const fileBase64 = btoa(binary);
      return uploadPrintingImageFn({
        data: { printingId, fileName: file.name, fileType: file.type, fileBase64, mode },
      });
    },
    invalidates,
  });
}

export function useSetCandidatePrintingImage(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async ({
      candidatePrintingId,
      mode,
    }: {
      candidatePrintingId: string;
      mode: "main" | "additional";
    }) => {
      await setCandidatePrintingImageFn({ data: { candidatePrintingId, mode } });
    },
    invalidates,
  });
}

export function useUploadCandidates() {
  return useMutationWithInvalidation({
    mutationFn: (payload: UploadCandidatesBody) => uploadCandidatesFn({ data: payload }),
    invalidates: [queryKeys.admin.cards.all],
  });
}
