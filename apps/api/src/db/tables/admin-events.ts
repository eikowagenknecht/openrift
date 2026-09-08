import type { Generated } from "kysely";

import type { CreatedAt } from "./columns.js";

/** Enforced here, not by a DB CHECK, so adding an action needs no migration. */
export type AdminEventAction =
  | "card.accept-new"
  | "card.accept-favorites"
  | "card.accept-field"
  | "card.create"
  | "card.rename"
  | "card.delete"
  | "card.link-unmatched"
  | "printing.accept"
  | "printing.accept-favorites"
  | "printing.accept-field"
  | "printing.create"
  | "printing.delete"
  | "printing.update"
  | "printing.fallback-art"
  | "candidate-printing.patch"
  | "candidate-printing.delete"
  | "candidate-printing.copy"
  | "candidate-printing.link"
  | "candidate-printing.relink"
  | "candidate-printing.ignore"
  | "candidate-printing.unignore"
  | "candidate-card.ignore"
  | "candidate-card.unignore"
  | "card-submission.resolution"
  | "image.set-from-candidate"
  | "image.activate"
  | "image.rotate"
  | "image.rehost"
  | "image.unrehost"
  | "image.set-needs-trim"
  | "image.add-url"
  | "image.upload"
  | "image.credit"
  | "image.face"
  | "image.delete"
  | "citation.create"
  | "citation.update"
  | "citation.delete"
  | "errata.upsert"
  | "errata.delete"
  | "errata.upload"
  | "ban.add"
  | "ban.update"
  | "ban.delete"
  | "provider.delete-candidates"
  | "candidates.upload"
  | "meta-overlays.upload"
  | "meta-catalog.accept"
  | "meta-catalog.dismiss"
  | "meta-catalog.undismiss"
  | "meta-catalog.settings"
  | "meta-catalog.template"
  | "meta-catalog.format"
  | "meta-submission.resolve"
  | "meta-submission.reopen";

export type AdminEventEntityType =
  | "card"
  | "printing"
  | "candidate-card"
  | "candidate-printing"
  | "card-submission"
  | "meta-catalog"
  | "meta-catalog-template"
  | "meta-catalog-format"
  | "meta-submission"
  | "image"
  | "citation"
  | "errata"
  | "ban"
  | "provider"
  | "upload";

/**
 * actorUserId has no FK, so rows survive user deletion. Check/uncheck
 * bookkeeping is deliberately not logged.
 */
export interface AdminEventsTable {
  id: Generated<string>;
  actorUserId: string;
  action: AdminEventAction;
  entityType: AdminEventEntityType;
  entityId: string | null;
  entityLabel: string | null;
  cardSlug: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: CreatedAt;
}
