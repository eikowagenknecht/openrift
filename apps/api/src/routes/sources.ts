import { createSourceSchema, updateSourceSchema } from "@openrift/shared/schemas";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { createCrudRoute } from "../crud-factory.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { toSource } from "../utils/dto.js";

export const sourcesRoute = createCrudRoute({
  path: "/sources",
  table: "sources",
  toDto: toSource,
  createSchema: createSourceSchema,
  updateSchema: updateSourceSchema,
  toInsert: (body) => ({
    name: body.name,
    description: body.description ?? null,
  }),
  patchFields: { name: "name", description: "description" },
});
