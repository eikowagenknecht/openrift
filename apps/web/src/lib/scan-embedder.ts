import type { CardEmbedder } from "@openrift/shared/scan";
import { EMBED_IMAGE_SIZE, embedImageSizeOf } from "@openrift/shared/scan";

import { fetchWithProgress } from "@/lib/fetch-progress";
import { scanAssetError } from "@/lib/scan-asset-hint";
import { encoderCreateRetryable, encoderStartErrorMessage } from "@/lib/scan-encoder-error";
import type { OrtWasmPaths } from "@/lib/scan-ort-assets";

let cached: Promise<CardEmbedder> | null = null;
// Single slot, latest caller wins: a strict-mode/navigation remount while the
// download is in flight should keep painting through the fresh callback.
let progressListener: ((loaded: number, total: number) => void) | null = null;
let embedMsPerImage = 0;
let embedInputSize = EMBED_IMAGE_SIZE;

export const SLOW_DEVICE_EMBED_MS = 250;

const CREATE_RETRY_DELAY_MS = 1000;

export function measuredEmbedMsPerImage(): number {
  return embedMsPerImage;
}

/** Authoritative only after `loadScanEmbedder` resolves. */
export function embedderImageSize(): number {
  return embedInputSize;
}

/**
 * WASM is the only execution provider used: WebGPU is broken on iOS under
 * onnxruntime-web.
 */
export async function loadScanEmbedder(
  modelUrl: string,
  // Must be passed in: a `?url` import inside a worker's graph gets inlined as base64.
  wasmPaths: OrtWasmPaths,
  onProgress?: (loaded: number, total: number) => void,
  inWorker = false,
): Promise<CardEmbedder> {
  if (onProgress) {
    progressListener = onProgress;
  }
  cached ??= (async () => {
    const ort = await import("onnxruntime-web/wasm");
    // Binary only: overriding the glue path too would switch ort off its
    // embedded copy for a separate download.
    ort.env.wasm.wasmPaths = { wasm: wasmPaths.wasm };
    // Threads only engage under cross-origin isolation (COOP/COEP); ort clamps
    // to 1 thread without it.
    const params = new URLSearchParams(globalThis.location?.search ?? "");
    const threadsOverride = Number(params.get("ortThreads"));
    // Proxying keeps inference off the main thread; inside the scan worker
    // there is no main thread to protect.
    ort.env.wasm.proxy = !inWorker && params.get("ortProxy") !== "0";
    ort.env.wasm.numThreads =
      threadsOverride > 0 ? threadsOverride : Math.min(4, navigator.hardwareConcurrency || 1);
    console.log(
      `[scan] ort init: numThreads ${ort.env.wasm.numThreads} proxy ${ort.env.wasm.proxy}` +
        ` crossOriginIsolated ${globalThis.crossOriginIsolated === true}`,
    );

    // Never held in a variable: the create call transfers the buffer, so an
    // inline temporary keeps a failed attempt's copy collectable (iOS OOM otherwise).
    const fetchModel = () =>
      fetchWithProgress(
        modelUrl,
        (loaded, total) => progressListener?.(loaded, total),
        scanAssetError("the encoder", modelUrl),
      );
    const createEncoderSession = async () =>
      ort.InferenceSession.create(await fetchModel(), {
        executionProviders: ["wasm"],
        // "basic" creates ~4x cheaper than the default "all" with identical
        // measured inference speed for this model.
        graphOptimizationLevel: "basic",
      });

    let session: Awaited<ReturnType<typeof createEncoderSession>>;
    try {
      session = await createEncoderSession();
    } catch (createError) {
      if (!encoderCreateRetryable(createError)) {
        // ort marks the backend aborted for the rest of the page's life; a
        // retry would fast-fail with the same error.
        console.error("[scan] encoder start failed (backend aborted)", createError);
        throw new Error(encoderStartErrorMessage(createError, "Could not start the encoder"));
      }
      // Re-fetch needed: the failed attempt's transfer detached the buffer.
      console.warn("[scan] encoder create failed, retrying once", createError);
      // oxlint-disable-next-line promise/avoid-new -- delay primitive
      await new Promise((resolve) => {
        setTimeout(resolve, CREATE_RETRY_DELAY_MS);
      });
      try {
        session = await createEncoderSession();
      } catch (retryError) {
        console.error("[scan] encoder start failed after retry", retryError);
        throw new Error(encoderStartErrorMessage(retryError, "Could not start the encoder"));
      }
    }
    const inputMeta = session.inputMetadata[0];
    embedInputSize = embedImageSizeOf(inputMeta?.isTensor ? inputMeta.shape : undefined);
    const size = embedInputSize;
    console.log(`[scan] encoder input ${size}px`);

    // Batch 1 is timed separately: candidates are embedded one at a time, so
    // its per-call overhead decides whether batching them helps a slow device.
    const warmupBatch = 2;
    const benchBatch = 4;
    for (const batch of [warmupBatch, benchBatch, 1]) {
      const benchInput = new Float32Array(batch * 3 * size * size);
      const benchStart = performance.now();
      await session.run({
        pixel_values: new ort.Tensor("float32", benchInput, [batch, 3, size, size]),
      });
      const elapsed = performance.now() - benchStart;
      if (batch === benchBatch) {
        embedMsPerImage = elapsed / batch;
      }
      console.log(`[scan] ort bench: batch${batch} ${elapsed.toFixed(0)}ms`);
    }
    console.log(`[scan] ort bench: ~${embedMsPerImage.toFixed(0)}ms/image`);

    return async (pixels, count) => {
      // Must be a copy (`slice`), not a view: the proxy worker receives the
      // tensor via postMessage transfer, which detaches the ArrayBuffer, and
      // a view would kill the session's reusable staging buffer.
      const slice = pixels.slice(0, count * 3 * size * size);
      const output = await session.run({
        pixel_values: new ort.Tensor("float32", slice, [count, 3, size, size]),
      });
      return output.image_embeds.data as Float32Array;
    };
  })();
  try {
    return await cached;
  } catch (error) {
    cached = null;
    throw error;
  }
}
