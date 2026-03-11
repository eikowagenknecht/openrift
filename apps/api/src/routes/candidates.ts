import { Hono } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";
import { handleList } from "./candidate-list.js";
import {
  handleAccept,
  handleAlias,
  handleBatchAccept,
  handlePatch,
  handleReject,
} from "./candidate-review.js";
import { handleUpload } from "./candidate-upload.js";

export const candidatesRoute = new Hono<{ Variables: Variables }>();

candidatesRoute.post("/candidates/upload", handleUpload);
candidatesRoute.get("/candidates", handleList);
candidatesRoute.patch("/candidates/:id", handlePatch);
candidatesRoute.post("/candidates/:id/accept", handleAccept);
candidatesRoute.post("/candidates/:id/reject", handleReject);
candidatesRoute.post("/candidates/batch-accept", handleBatchAccept);
candidatesRoute.post("/candidates/:id/alias", handleAlias);
