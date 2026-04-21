import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
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
    await fetchApi({
      errorTitle: "Couldn't delete printing image",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/printing-images/${encodeURIComponent(data.imageId)}`,
      method: "DELETE",
    });
  });

const activatePrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { imageId: string; active: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't activate printing image",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/printing-images/${encodeURIComponent(data.imageId)}/activate`,
      method: "POST",
      body: { active: data.active },
    });
  });

const rehostPrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { imageId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't rehost printing image",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/printing-images/${encodeURIComponent(data.imageId)}/rehost`,
      method: "POST",
    });
  });

const unrehostPrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { imageId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't unrehost printing image",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/printing-images/${encodeURIComponent(data.imageId)}/unrehost`,
      method: "POST",
    });
  });

type Rotation = 0 | 90 | 180 | 270;

const rotatePrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { imageId: string; rotation: Rotation }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't rotate printing image",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/printing-images/${encodeURIComponent(data.imageId)}/rotate`,
      method: "POST",
      body: { rotation: data.rotation },
    });
  });

const addImageFromUrlFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { printingId: string; url: string; source?: string; mode?: string }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't add image from URL",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/printing/${encodeURIComponent(data.printingId)}/add-image-url`,
      method: "POST",
      body: { url: data.url, source: data.source, mode: data.mode },
    });
  });

const setCandidatePrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { candidatePrintingId: string; mode: "main" | "additional" }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't set candidate printing image",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/candidate-printings/${encodeURIComponent(data.candidatePrintingId)}/set-image`,
      method: "POST",
      body: { mode: data.mode },
    });
  });

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

export function useAddImageFromUrl(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: ({
      printingId,
      ...body
    }: {
      printingId: string;
      url: string;
      source?: string;
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
      provider?: string;
      mode?: string;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const fileBytes = Uint8Array.from(atob(data.fileBase64), (c) => c.codePointAt(0) ?? 0);
    const blob = new Blob([fileBytes], { type: data.fileType });
    const formData = new FormData();
    formData.append("file", blob, data.fileName);
    if (data.provider) {
      formData.append("provider", data.provider);
    }
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
      provider,
      mode,
    }: {
      printingId: string;
      file: File;
      provider?: string;
      mode?: "main" | "additional";
    }) => {
      const buffer = await file.arrayBuffer();
      const fileBase64 = btoa(String.fromCodePoint(...new Uint8Array(buffer)));
      return uploadPrintingImageFn({
        data: { printingId, fileName: file.name, fileType: file.type, fileBase64, provider, mode },
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
