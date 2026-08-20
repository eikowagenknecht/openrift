import { adminCardImagesContract } from "@openrift/shared/contracts/admin/card-images";
import { adminCardMutationsContract } from "@openrift/shared/contracts/admin/card-mutations";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { UploadCandidatesBody, UploadCandidatesResponse } from "@/lib/server-fns/api-types";
import { getApiUrl } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// Request body derived from the route (api-types); response is the shared API
// type. Re-exported for the candidate-upload page.
export type { UploadCandidatesBody } from "@/lib/server-fns/api-types";

// ── Server functions ─────────────────────────────────────────────────────────

const deletePrintingImageFn = createServerFn({ method: "POST" })
  .validator((input: { imageId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardImagesContract, context.cookie).deleteImage({
      imageId: data.imageId,
    });
  });

const activatePrintingImageFn = createServerFn({ method: "POST" })
  .validator((input: { imageId: string; active: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardImagesContract, context.cookie).activateImage({
      imageId: data.imageId,
      active: data.active,
    });
  });

const rehostPrintingImageFn = createServerFn({ method: "POST" })
  .validator((input: { imageId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardImagesContract, context.cookie).rehostImage({
      imageId: data.imageId,
    });
  });

const unrehostPrintingImageFn = createServerFn({ method: "POST" })
  .validator((input: { imageId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardImagesContract, context.cookie).unrehostImage({
      imageId: data.imageId,
    });
  });

type Rotation = 0 | 90 | 180 | 270;

const rotatePrintingImageFn = createServerFn({ method: "POST" })
  .validator((input: { imageId: string; rotation: Rotation }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardImagesContract, context.cookie).rotateImage({
      imageId: data.imageId,
      rotation: data.rotation,
    });
  });

const setNeedsTrimFn = createServerFn({ method: "POST" })
  .validator((input: { imageId: string; needsTrim: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardImagesContract, context.cookie).setNeedsTrim({
      imageId: data.imageId,
      needsTrim: data.needsTrim,
    });
  });

const addImageFromUrlFn = createServerFn({ method: "POST" })
  .validator((input: { printingId: string; url: string; mode?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardImagesContract, context.cookie).addImageUrl({
      printingId: data.printingId,
      url: data.url,
      mode: data.mode as "main" | "additional" | undefined,
    });
  });

const setCandidatePrintingImageFn = createServerFn({ method: "POST" })
  .validator((input: { candidatePrintingId: string; mode: "main" | "additional" }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardImagesContract, context.cookie).setImage({
      id: data.candidatePrintingId,
      mode: data.mode,
    });
  });

const setFallbackArtFn = createServerFn({ method: "POST" })
  .validator(
    (input: { printingId: string; mode: "auto" | "pinned" | "none"; imageFileId?: string }) =>
      input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardImagesContract, context.cookie).setFallbackArt(data);
  });

const addFallbackArtUrlFn = createServerFn({ method: "POST" })
  .validator((input: { printingId: string; url: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardImagesContract, context.cookie).addFallbackArtUrl(data);
  });

const uploadFallbackArtFn = createServerFn({ method: "POST" })
  .validator(
    (input: { printingId: string; fileName: string; fileType: string; fileBase64: string }) =>
      input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const fileBytes = Uint8Array.from(atob(data.fileBase64), (c) => c.codePointAt(0) ?? 0);
    const blob = new Blob([fileBytes], { type: data.fileType });
    const formData = new FormData();
    formData.append("file", blob, data.fileName);
    // FormData body — can't use fetchApi helper (it JSON.stringify's bodies).
    const res = await fetch(
      `${getApiUrl()}/api/admin/v1/cards/printing/${encodeURIComponent(data.printingId)}/fallback-art/upload`,
      {
        method: "POST",
        headers: { cookie: context.cookie },
        body: formData,
      },
    );
    if (!res.ok) {
      throw new Error(`Upload fallback art failed: ${res.status}`);
    }
    return res.json();
  });

const uploadCandidatesFn = createServerFn({ method: "POST" })
  .validator((input: UploadCandidatesBody) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<UploadCandidatesResponse> =>
    apiOrpcClient(adminCardMutationsContract, context.cookie).upload(data),
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
      `${getApiUrl()}/api/admin/v1/cards/printing/${encodeURIComponent(data.printingId)}/upload-image`,
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

/**
 * Base64-encodes a file for the server-fn boundary, which carries JSON rather
 * than the `File` itself. Chunked because `String.fromCodePoint` is applied to
 * the byte array as arguments, and a whole image at once overflows the stack.
 * @returns The file's bytes as a base64 string.
 */
async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 32_768;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCodePoint(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

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
    }) =>
      uploadPrintingImageFn({
        data: {
          printingId,
          fileName: file.name,
          fileType: file.type,
          fileBase64: await toBase64(file),
          mode,
        },
      }),
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

/**
 * Set a printing's substitute-art override: derive it (`auto`), pin an image
 * file the catalogue already holds (`pinned`), or suppress it (`none`).
 * @returns The mutation object.
 */
export function useSetFallbackArt(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async (input: {
      printingId: string;
      mode: "auto" | "pinned" | "none";
      imageFileId?: string;
    }) => {
      await setFallbackArtFn({ data: input });
    },
    invalidates,
  });
}

/**
 * Pin substitute art from an external URL, ingesting the image first.
 * @returns The mutation object.
 */
export function useAddFallbackArtUrl(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async (input: { printingId: string; url: string }) => {
      await addFallbackArtUrlFn({ data: input });
    },
    invalidates,
  });
}

/**
 * Pin substitute art from a local file upload.
 * @returns The mutation object.
 */
export function useUploadFallbackArt(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async ({ printingId, file }: { printingId: string; file: File }) =>
      uploadFallbackArtFn({
        data: {
          printingId,
          fileName: file.name,
          fileType: file.type,
          fileBase64: await toBase64(file),
        },
      }),
    invalidates,
  });
}

export function useUploadCandidates() {
  return useMutationWithInvalidation({
    mutationFn: (payload: UploadCandidatesBody) => uploadCandidatesFn({ data: payload }),
    invalidates: [queryKeys.admin.cards.all],
  });
}
