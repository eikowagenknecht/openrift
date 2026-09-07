import type { jsPDFOptions } from "jspdf";
import { jsPDF } from "jspdf";

// All PDFs must go through this, not `new jsPDF`: without `compress: true`,
// jsPDF writes raw uncompressed pixel data (a 12 KB QR code became 5.8 MB).
export function createPdfDocument(options: jsPDFOptions): jsPDF {
  return new jsPDF({ ...options, compress: true });
}
