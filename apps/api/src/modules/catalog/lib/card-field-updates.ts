import type { AcceptCardField } from "@openrift/shared/contracts/admin/card-mutations";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { Updateable } from "kysely";

import type { CardsTable } from "../../../db/tables/catalog.js";
import { AppError } from "../../../errors.js";

export function cardUpdateFor(
  field: Exclude<AcceptCardField, "domains" | "superTypes" | "types">,
  finalValue: unknown,
): Updateable<CardsTable> {
  switch (field) {
    case "name": {
      return { name: finalValue as string };
    }
    case "might": {
      return { might: finalValue as number | null };
    }
    case "energy": {
      return { energy: finalValue as number | null };
    }
    case "power": {
      return { power: finalValue as number | null };
    }
    case "mightBonus": {
      return { mightBonus: finalValue as number | null };
    }
    case "tags": {
      return { tags: finalValue as string[] };
    }
    case "maxCopiesOverride": {
      return { maxCopiesOverride: finalValue as number | null };
    }
    case "comment": {
      return { comment: finalValue as string | null };
    }
    default: {
      const unhandled: never = field;
      throw new AppError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `Unsupported card field: ${String(unhandled)}`,
      );
    }
  }
}
