import type { OpenCvLike } from "@openrift/shared/scan/detect-cv";
import type { OrbCvLike } from "@openrift/shared/scan/orb";

import { fetchWithProgress } from "@/lib/fetch-progress";
import { scanAssetError } from "@/lib/scan-asset-hint";

type OpenCvModule = OpenCvLike & OrbCvLike;

let cvCached: Promise<OpenCvModule> | null = null;
let cvProgressListener: ((loaded: number, total: number) => void) | null = null;

function missingHint(scriptUrl: string): string {
  return scanAssetError("OpenCV", scriptUrl);
}

function installLocateFile(scriptUrl: string): unknown {
  const globalScope = globalThis as { Module?: unknown };
  const previous = globalScope.Module;
  const wasmUrl = scriptUrl.replace(/\.js$/u, ".wasm");
  globalScope.Module = {
    locateFile: (file: string) => (file.endsWith(".wasm") ? wasmUrl : file),
  };
  return previous;
}

// The emscripten export is a thenable; wrapping it in a real promise
// re-invokes `then` forever unless `then` is deleted first.
async function awaitCvExport(): Promise<OpenCvModule> {
  /* oxlint-disable promise/prefer-catch, promise/always-return, promise/avoid-new -- adapting a foreign thenable; every path settles */
  return await new Promise<OpenCvModule>((resolve, reject) => {
    (
      (globalThis as { cv?: unknown }).cv as {
        then: (fn: (value: OpenCvModule) => void, onError: (error: unknown) => void) => void;
      }
    ).then((cv) => {
      delete (cv as { then?: unknown }).then;
      resolve(cv);
    }, reject);
  });
  /* oxlint-enable promise/prefer-catch, promise/always-return, promise/avoid-new */
}

export async function loadOpenCv(
  scriptUrl: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<OpenCvModule> {
  if (onProgress) {
    cvProgressListener = onProgress;
  }
  /* oxlint-disable-next-line promise/avoid-new -- adapting a script tag; every path settles */
  cvCached ??= (async () => {
    // Importing the emscripten UMD as an ES module hangs the main thread
    // on evaluation in every engine tested; load it as a classic script tag.
    await fetchWithProgress(
      scriptUrl,
      (loaded, total) => cvProgressListener?.(loaded, total),
      missingHint(scriptUrl),
    );
    const previousModule = installLocateFile(scriptUrl);
    try {
      /* oxlint-disable-next-line promise/avoid-new -- adapting a script tag's load and error events */
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = scriptUrl;
        script.addEventListener("load", () => resolve(), { once: true });
        script.addEventListener(
          "error",
          () => reject(new Error("The OpenCV script failed to evaluate")),
          { once: true },
        );
        document.head.append(script);
      });
    } finally {
      (globalThis as { Module?: unknown }).Module = previousModule;
    }
    return await awaitCvExport();
  })();
  try {
    return await cvCached;
  } catch (error) {
    cvCached = null;
    throw error;
  }
}

// Module workers have no `importScripts` or script tag and must avoid the
// same ESM-wrapping hang as `loadOpenCv`; the downloaded text is evaluated directly.
export async function loadOpenCvInWorker(
  scriptUrl: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<OpenCvModule> {
  const source = new TextDecoder().decode(
    await fetchWithProgress(scriptUrl, onProgress, missingHint(scriptUrl)),
  );
  const previousModule = installLocateFile(scriptUrl);
  try {
    // oxlint-disable-next-line no-new-func, typescript/no-implied-eval -- the emscripten UMD must be evaluated as a classic script; see the module comment
    new Function(source)();
  } finally {
    (globalThis as { Module?: unknown }).Module = previousModule;
  }
  return await awaitCvExport();
}
