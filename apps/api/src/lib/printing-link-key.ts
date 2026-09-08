/**
 * Not in `services/candidate-links.ts`: the card-submission repository keys on
 * this, and a repository must not reach into a service.
 */
import { WellKnown } from "@openrift/shared/well-known";

/**
 * Short codes are uppercased on both sides so source-side casing drift
 * ("VEN-sp3" vs "VEN-SP3") still links, and marker slugs are sorted.
 */
export function buildPrintingLinkKey(printing: {
  shortCode: string;
  finish: string;
  markerSlugs: readonly string[];
  language: string | null;
}): string {
  const slugKey = [...printing.markerSlugs].toSorted().join(",");
  const language = printing.language ?? WellKnown.language.EN;
  return `${printing.shortCode.toUpperCase()}:${printing.finish}:${slugKey}:${language}`;
}
