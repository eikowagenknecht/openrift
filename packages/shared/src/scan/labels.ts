/**
 * The label table published beside the embedding bank under `media/scan`. The
 * API's bank rebuild writes it and the web scanner reads it back, so the shape
 * is a wire contract between the two and lives here rather than in either.
 */
export interface CardLabel {
  name: string;
  code: string;
  language: string;
  /**
   * cards.type — selects the measured text band for printing disambiguation.
   * Always written; optional because a bank generation predating the field is
   * still servable.
   */
  type?: string;
  /**
   * Serialized marker set ("promo", "" for none) — gates the stamp stage of
   * printing disambiguation. Null when the printings sharing this render
   * disagree, so the image carries no stamp evidence. Optional for the same
   * reason as {@link CardLabel.type}.
   */
  markers?: string | null;
}

/** The published label file: one {@link CardLabel} per bank key. */
export type CardLabels = Record<string, CardLabel>;
