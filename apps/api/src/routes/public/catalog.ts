import type { CatalogResponse } from "@openrift/shared";
import { catalogContract } from "@openrift/shared/contracts/catalog";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import {
  assembleCatalogResponse,
  filterCatalogResponseByLanguages,
  parseLanguageCodes,
} from "../../services/catalog-assembly.js";

const os = implement(catalogContract).$context<ApiContext>().use(requireUser);

/**
 * `GET /catalog`.
 *
 * Cards and printings are both returned as maps keyed by their own id; the id
 * is therefore omitted from each value (identity lives in the key). Sets stay
 * an array. Prices live on a separate `/api/v1/prices` endpoint with its own
 * cache lifetime, so the catalog ETag stays stable across daily price refreshes.
 *
 * `?langs=` / `?exceptLangs=` return the two halves of the language split (see
 * `catalogContract`); without them the response is the whole catalog. Filtering
 * the printings costs one pass over the assembled map, which is cheap enough to
 * do per request, so the variants are not cached separately.
 *
 * The ETag is the catalog's own content version rather than a hash of the body,
 * so every language variant of one catalog state carries the same tag. The web
 * client only ever learns one token — the whole catalog's — and appends it to
 * the variant URL it actually fetches (`?v=<token>&langs=EN`); a body hash would
 * give that variant a tag that could never equal the token, and
 * `immutableWhenVersionMatches` would silently never fire on the one request
 * shape production uses. ETags are scoped per-URL, so two variants sharing a tag
 * value is well-formed: `If-None-Match` is still only ever compared within a URL.
 */
export const catalogRouter = {
  catalog: os.catalog.handler(async ({ context, input }): Promise<CatalogResponse> => {
    const [catalog, version] = await Promise.all([
      assembleCatalogResponse(context.repos),
      context.repos.catalog.catalogResponseVersion(),
    ]);
    context.response.etag = version;
    return filterCatalogResponseByLanguages(catalog, {
      langs: input.langs === undefined ? undefined : parseLanguageCodes(input.langs),
      exceptLangs:
        input.exceptLangs === undefined ? undefined : parseLanguageCodes(input.exceptLangs),
    });
  }),
};
