/**
 * Deliberately its own module, never imported by the scan worker: Vite
 * inlines worker-imported assets as base64, turning a small worker bundle
 * into 54 MB. Only `wasm` is overridden, not `wasmPaths.mjs`, because nginx
 * serves no JS mime type for `.mjs`, which breaks onnxruntime-web's
 * standalone glue; the embedded glue stays in use instead.
 */
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

export interface OrtWasmPaths {
  wasm: string;
}

export const ORT_WASM_PATHS: OrtWasmPaths = { wasm: ortWasmUrl };
