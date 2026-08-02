/**
 * The onnxruntime WASM asset URLs, resolved by the bundler.
 *
 * Deliberately its own module, and deliberately never imported by the scan
 * worker. Vite inlines assets imported from inside a worker as base64 data
 * URLs, so pulling these into the worker's import graph turned a small worker
 * bundle into a 54 MB one. The page resolves them and hands them across in the
 * init message instead.
 */
// The ONNX runtime loads its WASM binary at runtime from a URL. Importing the
// file through Vite gives it a hashed asset URL so it is cached and versioned
// with the bundle instead of needing a copy in public/.
import ortWasmMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

export interface OrtWasmPaths {
  wasm: string;
  mjs: string;
}

/** Where onnxruntime should fetch its runtime from. */
export const ORT_WASM_PATHS: OrtWasmPaths = { wasm: ortWasmUrl, mjs: ortWasmMjsUrl };
