import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { isoDateTime } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const scanManifestSchema = z
  .object({
    /** False until a bank has ever been built on this server. */
    available: z.boolean(),
    /** Embedding bank serialization version (engine compatibility gate). */
    formatVersion: z.number().nullable(),
    /** Content hash naming the current bank/labels generation. */
    bankHash: z.string().nullable(),
    entryCount: z.number().nullable(),
    builtAt: isoDateTime.nullable(),
    /** Root-relative URLs of the immutable assets, null until available. */
    bankUrl: z.string().nullable(),
    labelsUrl: z.string().nullable(),
    /** Engine-versioned assets, present regardless of bank availability. */
    encoderUrl: z.string(),
    opencvUrl: z.string(),
  })
  .openapi("ScanManifestResponse");

/**
 * oRPC contract for the public scanner manifest.
 * `GET /api/v1/scan/manifest` — which content-hashed bank generation is
 * current and where the immutable scanner assets live. Everything it points
 * at is cached immutably, so this small endpoint is the only thing a client
 * must re-fetch.
 */
export const scanContract = {
  manifest: oc
    .route({ method: "GET", path: "/api/v1/scan/manifest", tags: ["Scan"] })
    .meta({ auth: "public", cache: "short", etag: true })
    .output(scanManifestSchema),
};

export type ScanContract = typeof scanContract;
export type ScanManifest = z.infer<typeof scanManifestSchema>;
