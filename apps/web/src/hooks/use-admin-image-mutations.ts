import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { UploadCandidatesBody, UploadCandidatesResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// Request body derived from the route (api-types); response is the shared API
// type. Re-exported for the candidate-upload page.
export type { UploadCandidatesBody };

// ── Server functions ─────────────────────────────────────────────────────────

const deletePrintingImageFn = createServerFn({ method: "POST" })
  .validator((input: { imageId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards["printing-images"][":imageId"].$delete({
        param: encodeParams({ imageId: data.imageId }),
      }),
      "Couldn't delete printing image",
    );
  });

const activatePrintingImageFn = createServerFn({ method: "POST" })
  .validator((input: { imageId: string; active: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards["printing-images"][
        ":imageId"
      ].activate.$post({
        param: encodeParams({ imageId: data.imageId }),
        json: { active: data.active },
      }),
      "Couldn't activate printing image",
    );
  });

const rehostPrintingImageFn = createServerFn({ method: "POST" })
  .validator((input: { imageId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards["printing-images"][
        ":imageId"
      ].rehost.$post({
        param: encodeParams({ imageId: data.imageId }),
      }),
      "Couldn't rehost printing image",
    );
  });

const unrehostPrintingImageFn = createServerFn({ method: "POST" })
  .validator((input: { imageId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards["printing-images"][
        ":imageId"
      ].unrehost.$post({
        param: encodeParams({ imageId: data.imageId }),
      }),
      "Couldn't unrehost printing image",
    );
  });

type Rotation = 0 | 90 | 180 | 270;

const rotatePrintingImageFn = createServerFn({ method: "POST" })
  .validator((input: { imageId: string; rotation: Rotation }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards["printing-images"][
        ":imageId"
      ].rotate.$post({
        param: encodeParams({ imageId: data.imageId }),
        json: { rotation: data.rotation },
      }),
      "Couldn't rotate printing image",
    );
  });

const setNeedsTrimFn = createServerFn({ method: "POST" })
  .validator((input: { imageId: string; needsTrim: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards["printing-images"][":imageId"][
        "set-needs-trim"
      ].$post({
        param: encodeParams({ imageId: data.imageId }),
        json: { needsTrim: data.needsTrim },
      }),
      "Couldn't update needs-trim",
    );
  });

const addImageFromUrlFn = createServerFn({ method: "POST" })
  .validator((input: { printingId: string; url: string; mode?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards.printing[":printingId"][
        "add-image-url"
      ].$post({
        param: encodeParams({ printingId: data.printingId }),
        json: { url: data.url, mode: data.mode as "main" | "additional" | undefined },
      }),
      "Couldn't add image from URL",
    );
  });

const setCandidatePrintingImageFn = createServerFn({ method: "POST" })
  .validator((input: { candidatePrintingId: string; mode: "main" | "additional" }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards["candidate-printings"][":id"][
        "set-image"
      ].$post({
        param: encodeParams({ id: data.candidatePrintingId }),
        json: { mode: data.mode },
      }),
      "Couldn't set candidate printing image",
    );
  });

const uploadCandidatesFn = createServerFn({ method: "POST" })
  .validator((input: UploadCandidatesBody) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<UploadCandidatesResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1.cards.upload.$post({ json: data }),
        "Couldn't upload candidates",
      ),
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
  .validator(
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
      `${API_URL}/api/admin/v1/cards/printing/${encodeURIComponent(data.printingId)}/upload-image`,
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
