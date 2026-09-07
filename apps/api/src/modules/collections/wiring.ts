import type { OwnedCopyRow } from "@openrift/shared/list-rule-eval";
import type { Kysely } from "kysely";

import type { Database } from "../../db/index.js";
import { collectionDeckbuildingPrefsRepo } from "./repositories/collection-deckbuilding-prefs.js";
import { collectionEventsRepo } from "./repositories/collection-events.js";
import { collectionSidebarPrefsRepo } from "./repositories/collection-sidebar-prefs.js";
import { collectionsRepo } from "./repositories/collections.js";
import { copiesRepo } from "./repositories/copies.js";
import { customTagCategoriesRepo } from "./repositories/custom-tag-categories.js";
import { customTagsRepo } from "./repositories/custom-tags.js";
import { clearCollection, deleteCollection, resetCollections } from "./services/collections.js";
import { addCopies, disposeCopies, moveCopies, updateCopies } from "./services/copies.js";

export interface CollectionsRepos {
  collectionEvents: ReturnType<typeof collectionEventsRepo>;
  collections: ReturnType<typeof collectionsRepo>;
  collectionDeckbuildingPrefs: ReturnType<typeof collectionDeckbuildingPrefsRepo>;
  collectionSidebarPrefs: ReturnType<typeof collectionSidebarPrefsRepo>;
  copies: ReturnType<typeof copiesRepo>;
  customTagCategories: ReturnType<typeof customTagCategoriesRepo>;
  customTags: ReturnType<typeof customTagsRepo>;
}

export interface CollectionsServices {
  clearCollection: typeof clearCollection;
  deleteCollection: typeof deleteCollection;
  resetCollections: typeof resetCollections;
  addCopies: typeof addCopies;
  moveCopies: typeof moveCopies;
  updateCopies: typeof updateCopies;
  disposeCopies: typeof disposeCopies;
}

export function createCollectionsRepos(db: Kysely<Database>): CollectionsRepos {
  return {
    collectionEvents: collectionEventsRepo(db),
    collections: collectionsRepo(db),
    collectionDeckbuildingPrefs: collectionDeckbuildingPrefsRepo(db),
    collectionSidebarPrefs: collectionSidebarPrefsRepo(db),
    copies: copiesRepo(db),
    customTagCategories: customTagCategoriesRepo(db),
    customTags: customTagsRepo(db),
  };
}

export function createOwnedCopiesReader(
  db: Kysely<Database>,
): (ownerId: string, printingIds?: readonly string[]) => Promise<OwnedCopyRow[]> {
  return (ownerId, printingIds) => copiesRepo(db).ownedRowsForUser(ownerId, printingIds);
}

export function createCollectionsServices(): CollectionsServices {
  return {
    clearCollection,
    deleteCollection,
    resetCollections,
    addCopies,
    moveCopies,
    updateCopies,
    disposeCopies,
  };
}
