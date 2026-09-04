/** A deck the viewer reaches by share token rather than through their account. */
export interface PublicDeckSource {
  shareToken: string;
  /** Cache-bust token for the rendered image, from the deck's `updatedAt`. */
  imageVersion: number;
}
