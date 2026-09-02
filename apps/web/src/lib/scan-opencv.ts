/**
 * Loading the OpenCV WASM build, on the main thread and inside the worker.
 *
 * Both loaders download the same asset and unwrap the same emscripten export;
 * they differ only in how the glue is evaluated, because the two environments
 * offer different ways of doing it (a script tag in the page, `new Function`
 * in a module worker, which has neither a document nor `importScripts`).
 * Keeping them side by side is what stops the two drifting: the `locateFile`
 * override and the thenable unwrap below are subtle enough that one copy
 * being fixed and the other not is the realistic failure.
 *
 * The custom trimmed build (scripts/scan/build-opencv.sh) splits the glue from
 * the wasm so browsers can cache the compiled machine code. The glue asks for
 * the wasm under its build-time name (`opencv_js.wasm`) while we serve it
 * renamed beside the script, so a `locateFile` override on the global `Module`
 * (captured synchronously at script evaluation) points it at the real file,
 * which by convention sits next to the .js with the same name and a .wasm
 * extension. A single-file build (the pre-trim serving) never consults
 * `locateFile`, so the override is compatible with both.
 */

import type { OpenCvLike, OrbCvLike } from "@openrift/shared/scan";

import { fetchWithProgress } from "@/lib/fetch-progress";
import { scanAssetError } from "@/lib/scan-asset-hint";

/** The initialised OpenCV module, with the ORB surface the matcher needs. */
type OpenCvModule = OpenCvLike & OrbCvLike;

let cvCached: Promise<OpenCvModule> | null = null;
// Single slot, latest caller wins — same reasoning as the encoder's listener.
let cvProgressListener: ((loaded: number, total: number) => void) | null = null;

/**
 * Message for a download that could not be served.
 *
 * @returns The message, hinting at whichever source the URL came from.
 */
function missingHint(scriptUrl: string): string {
  return scanAssetError("OpenCV", scriptUrl);
}

/**
 * Point the emscripten glue's wasm request at the file we serve it under.
 *
 * @returns The `Module` global's previous value, to hand back after
 *   evaluation — the factory captures the object itself, so the global slot is
 *   only needed for the duration of the evaluation.
 */
function installLocateFile(scriptUrl: string): unknown {
  const globalScope = globalThis as { Module?: unknown };
  const previous = globalScope.Module;
  const wasmUrl = scriptUrl.replace(/\.js$/u, ".wasm");
  globalScope.Module = {
    locateFile: (file: string) => (file.endsWith(".wasm") ? wasmUrl : file),
  };
  return previous;
}

/**
 * Unwrap the module the evaluated glue left on `globalThis.cv`.
 *
 * The emscripten export is a thenable rather than a real promise, and it must
 * never be resolved through a promise as-is: promise adoption calls its `then`
 * again with the same thenable, forever, which starves the microtask queue.
 * Stripping `then` inside the callback turns it into a plain object every
 * later await can hold safely.
 *
 * @returns The initialised module.
 */
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

/**
 * Load the OpenCV WASM build into the page, once per page.
 *
 * Evaluated as a plain classic script (served from `media/scan` next to the
 * bank), NOT as a module import: vite's dep-optimized ESM
 * wrapping of the emscripten UMD spins the main thread forever during
 * evaluation, in every engine tested, while the raw script evaluates in well
 * under a second.
 *
 * Downloaded through `fetchWithProgress` first so the load can report bytes (a
 * script tag exposes none), then evaluated by pointing the tag at that same
 * URL: media assets are served immutable, so the tag's request is a cache hit
 * rather than a second download, and the fetched bytes are dropped. Handing
 * the tag a `blob:` URL built from them would save the re-request, but a blob
 * script needs `blob:` in the CSP's `script-src`, which the served policy
 * (nginx/web.conf) deliberately does not carry.
 *
 * @returns The initialised OpenCV module.
 */
export async function loadOpenCv(
  scriptUrl: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<OpenCvModule> {
  if (onProgress) {
    cvProgressListener = onProgress;
  }
  /* oxlint-disable-next-line promise/avoid-new -- adapting a script tag; every path settles */
  cvCached ??= (async () => {
    // The bytes are only a progress signal: the script tag below asks for the
    // same URL and the browser answers it from cache.
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
      // The factory captured the Module object during evaluation; the global
      // slot can be handed back before the wasm finishes initialising.
      (globalThis as { Module?: unknown }).Module = previousModule;
    }
    return await awaitCvExport();
  })();
  try {
    return await cvCached;
  } catch (error) {
    // A failed download must not poison the page until reload: clear the slot
    // so the next mount retries.
    cvCached = null;
    throw error;
  }
}

/**
 * Load the OpenCV build inside the scan worker.
 *
 * A module worker has no `importScripts` and no script tag, and the glue must
 * never go through the bundler's ESM wrapping (see {@link loadOpenCv}).
 * Evaluating the downloaded text is what is left, and it is exactly what the
 * node bench does through `require`.
 *
 * @returns The initialised OpenCV module.
 */
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
