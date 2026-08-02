/**
 * The onnxruntime WASM asset URL, resolved by the bundler.
 *
 * Deliberately its own module, and deliberately never imported by the scan
 * worker. Vite inlines assets imported from inside a worker as base64 data
 * URLs, so pulling this into the worker's import graph turned a small worker
 * bundle into a 54 MB one. The page resolves it and hands it across in the
 * init message instead.
 *
 * Only the `.wasm` binary is overridden. The emscripten glue that loads it is
 * embedded in `onnxruntime-web/wasm` (the "bundle" build the ESM export maps
 * to), so pointing `wasmPaths.mjs` at the standalone glue file downloaded a
 * second copy of code already in the chunk, and made the scanner depend on the
 * server sending a JavaScript content type for `.mjs`. It did not: nginx's
 * mime.types has no `mjs` entry, the module import was refused, and the
 * failure surfaced as "no available backend found" because Vite's preload
 * helper reports import errors through `window.dispatchEvent`, which throws
 * inside ort's proxy worker. Passing only `wasm` keeps ort on the embedded
 * glue (see `useEmbeddedModule` in onnxruntime-web's wasm-utils-import).
 */
// The ONNX runtime loads its WASM binary at runtime from a URL. Importing the
// file through Vite gives it a hashed asset URL so it is cached and versioned
// with the bundle instead of needing a copy in public/.
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

export interface OrtWasmPaths {
  wasm: string;
}

/** Where onnxruntime should fetch its runtime from. */
export const ORT_WASM_PATHS: OrtWasmPaths = { wasm: ortWasmUrl };
