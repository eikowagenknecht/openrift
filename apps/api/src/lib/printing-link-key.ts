/**
 * The one key that identifies a live printing across the candidate pipelines.
 *
 * It lives here rather than beside the resolvers in `services/candidate-links.ts`
 * because both the card-submission repository and the submission diff key on it,
 * and a repository must not reach into a service for it.
 */
import { WellKnown } from "@openrift/shared";

/**
 * Composite key identifying one live printing. Short codes are uppercased on
 * both sides so source-side casing drift ("VEN-sp3" vs "VEN-SP3") still links,
 * and marker slugs are sorted so payload order never blocks a match.
 * @param printing The printing (live or candidate) to key.
 * @returns The `SHORTCODE:finish:markers:language` key.
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
