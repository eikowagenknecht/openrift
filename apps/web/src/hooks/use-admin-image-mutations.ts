import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export interface UploadCandidatesBody {
  provider: string;
  candidates: Record<string, unknown>[];
}

// Defined locally to avoid `unknown` vs `{}` mismatch with server function JSON serialization.
// Fields use JSON-safe types that match what the API actually returns.
export interface UploadCandidatesResponse {
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
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/printing-images/${encodeURIComponent(data.imageId)}`,
      { method: "DELETE", headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Delete printing image failed: ${res.status}`);
    }
  });

const activatePrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { imageId: string; active: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/printing-images/${encodeURIComponent(data.imageId)}/activate`,
      {
        method: "POST",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ active: data.active }),
      },
    );
    if (!res.ok) {
      throw new Error(`Activate printing image failed: ${res.status}`);
    }
  });

const rehostPrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { imageId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/printing-images/${encodeURIComponent(data.imageId)}/rehost`,
      { method: "POST", headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Rehost printing image failed: ${res.status}`);
    }
  });

const unrehostPrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { imageId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/printing-images/${encodeURIComponent(data.imageId)}/unrehost`,
      { method: "POST", headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Unrehost printing image failed: ${res.status}`);
    }
  });

const addImageFromUrlFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { printingId: string; url: string; source?: string; mode?: string }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/printing/${encodeURIComponent(data.printingId)}/add-image-url`,
      {
        method: "POST",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ url: data.url, source: data.source, mode: data.mode }),
      },
    );
    if (!res.ok) {
      throw new Error(`Add image from URL failed: ${res.status}`);
    }
    return res.json();
  });

const setCandidatePrintingImageFn = createServerFn({ method: "POST" })
  .inputValidator((input: { candidatePrintingId: string; mode: "main" | "additional" }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/candidate-printings/${encodeURIComponent(data.candidatePrintingId)}/set-image`,
      {
        method: "POST",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ mode: data.mode }),
      },
    );
    if (!res.ok) {
      throw new Error(`Set candidate printing image failed: ${res.status}`);
    }
  });

const uploadCandidatesFn = createServerFn({ method: "POST" })
  .inputValidator((input: UploadCandidatesBody) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/cards/upload`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Upload candidates failed: ${res.status}`);
    }
    return (await res.json()) as UploadCandidatesResponse;
  });

// ── Hook exports ─────────────────────────────────────────────────────────────

export function useDeletePrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async (imageId: string) => {
      await deletePrintingImageFn({ data: { imageId } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useActivatePrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async ({ imageId, active }: { imageId: string; active: boolean }) => {
      await activatePrintingImageFn({ data: { imageId, active } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useRehostPrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async (imageId: string) => {
      await rehostPrintingImageFn({ data: { imageId } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useUnrehostPrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async (imageId: string) => {
      await unrehostPrintingImageFn({ data: { imageId } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAddImageFromUrl() {
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
    invalidates: [queryKeys.admin.cards.all],
  });
}

// Keep using RPC client for file upload (FormData serialization through server functions is complex)
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
      await setCandidatePrintingImageFn({ data: { candidatePrintingId, mode } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useUploadCandidates() {
  return useMutationWithInvalidation({
    mutationFn: (payload: UploadCandidatesBody) => uploadCandidatesFn({ data: payload }),
    invalidates: [queryKeys.admin.cards.all],
  });
}
