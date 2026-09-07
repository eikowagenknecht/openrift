import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

export const userShareStateResponseSchema = z
  .object({ shareToken: z.string().nullable(), isPublic: z.boolean() })
  .openapi("UserShareStateResponse");

export const userShareContract = {
  get: authedRoute
    .route({ method: "GET", path: "/api/v1/users/me/share", tags: ["User Share"] })
    .output(userShareStateResponseSchema),
  enable: authedRoute
    .route({ method: "POST", path: "/api/v1/users/me/share", tags: ["User Share"] })
    .errors({ NOT_FOUND: { message: "User not found" } })
    .output(userShareStateResponseSchema),
  disable: authedRoute
    .route({
      method: "DELETE",
      path: "/api/v1/users/me/share",
      successStatus: 204,
      tags: ["User Share"],
    })
    .errors({ NOT_FOUND: { message: "User not found" } }),
  rotate: authedRoute
    .route({ method: "POST", path: "/api/v1/users/me/share/rotate", tags: ["User Share"] })
    .errors({ NOT_FOUND: { message: "User not found" } })
    .output(userShareStateResponseSchema),
};

export type UserShareContract = typeof userShareContract;
