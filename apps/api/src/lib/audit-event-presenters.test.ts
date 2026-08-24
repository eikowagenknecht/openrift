import { describe, expect, it } from "vitest";

import type { AdminEventRow } from "../repositories/admin-events.js";
import { toAuditEvent } from "./audit-event-presenters.js";

const ROW: AdminEventRow = {
  id: "event-1",
  actorUserId: "user-1",
  actorName: "Poppy",
  actorEmail: "poppy@example.com",
  action: "card.update",
  entityType: "card",
  entityId: "card-1",
  entityLabel: "Yasuo, Windchaser",
  cardSlug: "yasuo-windchaser",
  oldValues: { energy: 3 },
  newValues: { energy: 4 },
  createdAt: new Date("2026-08-15T23:59:07.250Z"),
};

describe("toAuditEvent", () => {
  it("renders the timestamp as ISO 8601 and passes every other column through", () => {
    expect(toAuditEvent(ROW)).toEqual({
      id: "event-1",
      actorUserId: "user-1",
      actorName: "Poppy",
      actorEmail: "poppy@example.com",
      action: "card.update",
      entityType: "card",
      entityId: "card-1",
      entityLabel: "Yasuo, Windchaser",
      cardSlug: "yasuo-windchaser",
      oldValues: { energy: 3 },
      newValues: { energy: 4 },
      createdAt: "2026-08-15T23:59:07.250Z",
    });
  });

  it("keeps the nullable columns null rather than dropping them", () => {
    const result = toAuditEvent({
      ...ROW,
      actorName: null,
      actorEmail: null,
      entityId: null,
      entityLabel: null,
      cardSlug: null,
      oldValues: null,
      newValues: null,
    });
    expect(result).toMatchObject({
      actorName: null,
      actorEmail: null,
      entityId: null,
      entityLabel: null,
      cardSlug: null,
      oldValues: null,
      newValues: null,
    });
  });

  it("does not mutate the row it was given", () => {
    const row = { ...ROW };
    toAuditEvent(row);
    expect(row.createdAt).toBeInstanceOf(Date);
  });
});
