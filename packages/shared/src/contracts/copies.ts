import { oc } from "@orpc/contract";

import {
  copyAddResponseSchema,
  copyListMembershipsResponseSchema,
  copyListResponseSchema,
} from "../response-schemas.js";
import {
  addCopiesSchema,
  copiesQuerySchema,
  copyListMembershipsSchema,
  disposeCopiesSchema,
  moveCopiesSchema,
} from "../schemas.js";

/**
 * oRPC contract for the authenticated copies endpoints. All require a session
 * (the mount applies `requireAuth`). `add` returns 201; `move` and `dispose`
 * return 204 with no body; `add` can return a typed BAD_REQUEST when a copy
 * references a non-existent printing.
 */
export const copiesContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/copies", tags: ["Copies"] })
    .input(copiesQuerySchema)
    .output(copyListResponseSchema),
  add: oc
    .route({ method: "POST", path: "/api/v1/copies", tags: ["Copies"], successStatus: 201 })
    .input(addCopiesSchema)
    .errors({ BAD_REQUEST: { message: "One or more printings do not exist" } })
    .output(copyAddResponseSchema),
  move: oc
    .route({ method: "POST", path: "/api/v1/copies/move", tags: ["Copies"], successStatus: 204 })
    .input(moveCopiesSchema),
  dispose: oc
    .route({ method: "POST", path: "/api/v1/copies/dispose", tags: ["Copies"], successStatus: 204 })
    .input(disposeCopiesSchema),
  listMemberships: oc
    .route({ method: "POST", path: "/api/v1/copies/list-memberships", tags: ["Copies"] })
    .input(copyListMembershipsSchema)
    .output(copyListMembershipsResponseSchema),
};

export type CopiesContract = typeof copiesContract;
