import { ERROR_CODES } from "@openrift/shared";
import type { DeckFolderListResponse, DeckFolderResponse } from "@openrift/shared";
import { deckFoldersContract } from "@openrift/shared/contracts/deck-folders";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { assertFound } from "../../lib/assertions.js";
import { toDeckFolder } from "../../lib/deck-folder-presenters.js";
import { isUniqueViolationOn } from "../../lib/pg-errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const NAME_TAKEN = "You already have a folder with that name";

/** Turns the case-insensitive name collision into a 409; other errors rethrow. */
function rethrowFolderError(error: unknown): never {
  if (isUniqueViolationOn(error, "uq_deck_folders_user_name")) {
    throw new AppError(409, ERROR_CODES.CONFLICT, NAME_TAKEN);
  }
  throw error;
}

const os = implement(deckFoldersContract).$context<ApiContext>().use(requireAuthedUser);

/** Not-found and conflict states must be thrown as `AppError`; the handler's appErrorInterceptor maps only that type. */
export const deckFoldersRouter = {
  list: os.list.handler(async ({ context }): Promise<DeckFolderListResponse> => {
    const rows = await context.repos.deckFolders.listForUser(context.userId);
    return { items: rows.map((row) => toDeckFolder(row)) };
  }),

  create: os.create.handler(async ({ input, context }): Promise<DeckFolderResponse> => {
    const name = input.name.trim();
    if (name === "") {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Folder name cannot be blank");
    }
    // Not a check-then-act: the unique index is the arbiter, so two concurrent
    // creates of the same name give one folder and one 409.
    let row;
    try {
      row = await context.repos.deckFolders.create(context.userId, name);
    } catch (error) {
      rethrowFolderError(error);
    }
    return toDeckFolder(row);
  }),

  update: os.update.handler(async ({ input, context }): Promise<DeckFolderResponse> => {
    const name = input.name.trim();
    if (name === "") {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Folder name cannot be blank");
    }
    let row;
    try {
      row = await context.repos.deckFolders.rename(input.id, context.userId, name);
    } catch (error) {
      rethrowFolderError(error);
    }
    assertFound(row, "Folder not found");
    return toDeckFolder(row);
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    // Membership rows cascade; the decks themselves are untouched.
    const deleted = await context.repos.deckFolders.remove(input.id, context.userId);
    if (!deleted) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Folder not found");
    }
  }),

  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    await context.repos.deckFolders.reorder(context.userId, input.orderedIds);
  }),

  setForDeck: os.setForDeck.handler(async ({ input, context }): Promise<DeckFolderListResponse> => {
    const { decks, deckFolders } = context.repos;
    const userId = context.userId;
    const deck = await decks.getByIdForUser(input.id, userId);
    assertFound(deck, "Deck not found");
    await deckFolders.setForDeck(input.id, userId, input.folderIds);
    // Returning the full folder list keeps the client's deck counts correct
    // without a second round trip — every count can shift on one membership edit.
    const rows = await deckFolders.listForUser(userId);
    return { items: rows.map((row) => toDeckFolder(row)) };
  }),
};
