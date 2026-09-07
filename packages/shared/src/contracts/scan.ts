import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { isoDateTime } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const scanManifestSchema = z
  .object({
    available: z.boolean(),
    formatVersion: z.number().nullable(),
    bankHash: z.string().nullable(),
    entryCount: z.number().nullable(),
    builtAt: isoDateTime.nullable(),
    bankUrl: z.string().nullable(),
    labelsUrl: z.string().nullable(),
    encoderUrl: z.string(),
    opencvUrl: z.string(),
  })
  .openapi("ScanManifestResponse");

/** Everything this points at is cached immutably, so it is the only thing a client must re-fetch. */
export const scanContract = {
  manifest: oc
    .route({ method: "GET", path: "/api/v1/scan/manifest", tags: ["Scan"] })
    .meta({ auth: "public", cache: "short", etag: true })
    .output(scanManifestSchema),
};

export type ScanContract = typeof scanContract;
export type ScanManifest = z.infer<typeof scanManifestSchema>;
