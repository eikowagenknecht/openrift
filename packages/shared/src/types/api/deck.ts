export interface DeckResponse {
  id: string;
  name: string;
  description: string | null;
  format: "standard" | "freeform";
  isWanted: boolean;
  isPublic: boolean;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}
