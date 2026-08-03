import type { jsPDFOptions } from "jspdf";
import { jsPDF } from "jspdf";

/**
 * Shared jsPDF factory. Every PDF the app generates (proxy sheets, registration
 * sheets, binder QR sheets, the deck image wrapper) must go through this rather
 * than calling `new jsPDF` directly.
 *
 * All it adds is `compress: true`, which is not a nice-to-have. jsPDF only
 * defaults `addImage`'s compression to "SLOW" when the document's filter list
 * already contains FlateEncode, and `compress` is what puts it there. Without
 * the flag the compression argument normalises to "NONE", so `processPNG`
 * decodes the source PNG and writes the raw pixel data plus an uncompressed
 * alpha SMask straight into the stream: a 12 KB QR code became 5.8 MB, and a
 * proxy card costs ~1.4 MB apiece. Compressing costs about 50 ms per sheet.
 * @returns A jsPDF document with image and stream compression enabled.
 */
export function createPdfDocument(options: jsPDFOptions): jsPDF {
  return new jsPDF({ ...options, compress: true });
}
