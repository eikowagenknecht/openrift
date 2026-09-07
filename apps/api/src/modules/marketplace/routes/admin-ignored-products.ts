import { adminIgnoredProductsContract } from "@openrift/shared/contracts/admin/ignored-products";
import type { IgnoredProductResponse } from "@openrift/shared/types/api/admin";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";

const os = implement(adminIgnoredProductsContract).$context<ApiContext>().use(requireAuthedUser);

export const adminIgnoredProductsRouter = {
  list: os.list.handler(async ({ context }) => {
    const { marketplaceAdmin: mktAdmin } = context.repos;
    const rows = await mktAdmin.listIgnoredProducts();
    return {
      products: rows.map((r): IgnoredProductResponse =>
        r.level === "product"
          ? {
              level: "product",
              marketplace: r.marketplace,
              externalId: r.externalId,
              productName: r.productName,
              createdAt: r.createdAt.toISOString(),
            }
          : {
              level: "variant",
              marketplace: r.marketplace,
              externalId: r.externalId,
              finish: r.finish,
              language: r.language,
              productName: r.productName,
              createdAt: r.createdAt.toISOString(),
            },
      ),
    };
  }),

  ignore: os.ignore.handler(async ({ input, context }) => {
    const { marketplaceAdmin: mktAdmin } = context.repos;

    const externalIds = input.products.map((p) => p.externalId);
    const stagingRows = await mktAdmin.getStagingProductNames(input.marketplace, externalIds);

    const nameMap = new Map<number, string>();
    for (const row of stagingRows) {
      if (!nameMap.has(row.externalId)) {
        nameMap.set(row.externalId, row.productName);
      }
    }

    if (input.level === "product") {
      const values = input.products
        .filter((p) => nameMap.has(p.externalId))
        .map((p) => ({
          marketplace: input.marketplace,
          externalId: p.externalId,
          productName: nameMap.get(p.externalId) ?? "",
        }));

      if (values.length > 0) {
        await mktAdmin.insertIgnoredProducts(values);
      }
      return { ignored: values.length };
    }

    const values = input.products
      .filter((p) => nameMap.has(p.externalId))
      .map((p) => ({
        marketplace: input.marketplace,
        externalId: p.externalId,
        finish: p.finish,
        language: p.language,
        productName: nameMap.get(p.externalId) ?? "",
      }));

    if (values.length > 0) {
      await mktAdmin.insertIgnoredVariants(values);
    }
    return { ignored: values.length };
  }),

  unignore: os.unignore.handler(async ({ input, context }) => {
    const { marketplaceAdmin: mktAdmin } = context.repos;

    if (input.level === "product") {
      const deleted = await mktAdmin.deleteIgnoredProducts(
        input.marketplace,
        input.products.map((p) => p.externalId),
      );
      return { unignored: deleted };
    }

    const deleted = await mktAdmin.deleteIgnoredVariants(
      input.marketplace,
      input.products.map((p) => ({
        externalId: p.externalId,
        finish: p.finish,
        language: p.language,
      })),
    );
    return { unignored: deleted };
  }),
};
