import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const userShareStateResponseSchema = z
  .object({ shareToken: z.string().nullable(), isPublic: z.boolean() })
  .openapi("UserShareStateResponse");

/**
 * oRPC contract for the signed-in user's bundle-share management (ADR-018).
 * `GET/POST/DELETE /api/v1/users/me/share` (+ `POST .../rotate`). Requires a
 * session (mount applies `requireAuth`). `disable` is 204; the others return
 * the share state. A missing user is a typed NOT_FOUND.
 */
export const userShareContract = {
  get: oc
    .route({ method: "GET", path: "/api/v1/users/me/share", tags: ["User Share"] })
    .output(userShareStateResponseSchema),
  enable: oc
    .route({ method: "POST", path: "/api/v1/users/me/share", tags: ["User Share"] })
    .errors({ NOT_FOUND: { message: "User not found" } })
    .output(userShareStateResponseSchema),
  disable: oc
    .route({
      method: "DELETE",
      path: "/api/v1/users/me/share",
      successStatus: 204,
      tags: ["User Share"],
    })
    .errors({ NOT_FOUND: { message: "User not found" } }),
  rotate: oc
    .route({ method: "POST", path: "/api/v1/users/me/share/rotate", tags: ["User Share"] })
    .errors({ NOT_FOUND: { message: "User not found" } })
    .output(userShareStateResponseSchema),
};

export type UserShareContract = typeof userShareContract;
