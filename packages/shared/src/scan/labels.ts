/**
 * Label table published beside the embedding bank under `media/scan`.
 * Written by the API's bank rebuild and read by the web scanner: a wire
 * contract between the two.
 */
export interface CardLabel {
  name: string;
  code: string;
  language: string;
  type?: string;
  /** "promo", "" for none. */
  markers?: string | null;
}

export type CardLabels = Record<string, CardLabel>;
