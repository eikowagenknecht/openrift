export interface WishEntryFlat {
  entryId: string;
  listId: string;
  listName: string;
  kind: "card" | "printing";
  cardId?: string;
  printingId?: string;
  quantity: number;
}
