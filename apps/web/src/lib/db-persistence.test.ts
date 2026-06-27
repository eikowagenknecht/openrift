import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
} from "@tanstack/browser-db-sqlite-persistence";
import { PersistenceUnavailableError } from "@tanstack/db-sqlite-persistence-core";
import type { PersistedCollectionPersistence } from "@tanstack/db-sqlite-persistence-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPersistenceSnapshot,
  resetPersistenceForTesting,
  subscribeToPersistence,
  wipePersistedData,
} from "./db-persistence";

vi.mock("@tanstack/browser-db-sqlite-persistence", () => ({
  BrowserCollectionCoordinator: vi.fn(),
  createBrowserWASQLitePersistence: vi.fn(),
  openBrowserWASQLiteOPFSDatabase: vi.fn(),
}));

const openDatabase = vi.mocked(openBrowserWASQLiteOPFSDatabase);
const createPersistence = vi.mocked(createBrowserWASQLitePersistence);
const Coordinator = vi.mocked(BrowserCollectionCoordinator);

const fakeDatabase = { execute: vi.fn(), close: vi.fn() };
const fakePersistence = { adapter: {}, coordinator: {} } as PersistedCollectionPersistence;

async function waitForReady(): Promise<void> {
  await vi.waitFor(() => {
    expect(getPersistenceSnapshot().status).toBe("ready");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetPersistenceForTesting();
  openDatabase.mockResolvedValue(fakeDatabase);
  createPersistence.mockReturnValue(fakePersistence);
});

afterEach(() => {
  resetPersistenceForTesting();
});

describe("getPersistenceSnapshot", () => {
  it("starts pending and returns a stable snapshot reference", () => {
    expect(getPersistenceSnapshot()).toEqual({ status: "pending" });
    expect(getPersistenceSnapshot()).toBe(getPersistenceSnapshot());
  });

  it("does not initialize before the first subscription", () => {
    getPersistenceSnapshot();
    expect(openDatabase).not.toHaveBeenCalled();
  });
});

describe("subscribeToPersistence", () => {
  it("settles ready with the persistence instance on success", async () => {
    const listener = vi.fn();
    subscribeToPersistence(listener);

    await waitForReady();

    expect(getPersistenceSnapshot()).toEqual({ status: "ready", persistence: fakePersistence });
    expect(listener).toHaveBeenCalled();
    expect(openDatabase).toHaveBeenCalledWith({ databaseName: "openrift.sqlite" });
    expect(Coordinator).toHaveBeenCalledWith({ dbName: "openrift.sqlite" });
    expect(createPersistence).toHaveBeenCalledWith({
      database: fakeDatabase,
      coordinator: Coordinator.mock.instances[0],
    });
  });

  it("stays pending while the database is still opening", async () => {
    const { promise, resolve } = Promise.withResolvers<typeof fakeDatabase>();
    openDatabase.mockReturnValue(promise);
    subscribeToPersistence(vi.fn());

    expect(getPersistenceSnapshot()).toEqual({ status: "pending" });

    resolve(fakeDatabase);
    await waitForReady();
  });

  it("settles ready(null) when persistence is unavailable, without a warning", async () => {
    openDatabase.mockRejectedValue(new PersistenceUnavailableError("no OPFS"));
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      subscribeToPersistence(vi.fn());
      await waitForReady();

      expect(getPersistenceSnapshot()).toEqual({ status: "ready", persistence: null });
      expect(infoSpy).toHaveBeenCalledOnce();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      infoSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it("settles ready(null) and warns on an unexpected failure", async () => {
    openDatabase.mockRejectedValue(new Error("worker exploded"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      subscribeToPersistence(vi.fn());
      await waitForReady();

      expect(getPersistenceSnapshot()).toEqual({ status: "ready", persistence: null });
      expect(warnSpy).toHaveBeenCalledOnce();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("initializes once across multiple subscribers", async () => {
    subscribeToPersistence(vi.fn());
    subscribeToPersistence(vi.fn());
    await waitForReady();
    subscribeToPersistence(vi.fn());

    expect(openDatabase).toHaveBeenCalledOnce();
  });

  it("stops notifying after unsubscribe", async () => {
    const { promise, resolve } = Promise.withResolvers<typeof fakeDatabase>();
    openDatabase.mockReturnValue(promise);
    const listener = vi.fn();
    const unsubscribe = subscribeToPersistence(listener);
    unsubscribe();

    resolve(fakeDatabase);
    await waitForReady();

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("wipePersistedData", () => {
  const ALL_TABLES = [
    { name: "c_abc123_8" },
    { name: "t_abc123_8" },
    { name: "applied_tx" },
    { name: "collection_metadata" },
    { name: "collection_version" },
    { name: "collection_registry" },
    { name: "persisted_index_registry" },
    { name: "collection_reset_epoch" },
    { name: "leader_term" },
  ];

  beforeEach(() => {
    fakeDatabase.execute.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes("sqlite_master") ? ALL_TABLES : []),
    );
  });

  it("deletes rows from data-bearing tables only", async () => {
    await wipePersistedData();

    const deletedTables = fakeDatabase.execute.mock.calls
      .map(([sql]) => /^DELETE FROM "(?<table>[^"]+)"$/u.exec(sql as string)?.groups?.table)
      .filter(Boolean);
    expect(deletedTables.toSorted()).toEqual([
      "applied_tx",
      "c_abc123_8",
      "collection_metadata",
      "collection_version",
      "t_abc123_8",
    ]);
  });

  it("initializes persistence first when called before any subscription", async () => {
    expect(getPersistenceSnapshot().status).toBe("pending");

    await wipePersistedData();

    expect(getPersistenceSnapshot()).toEqual({ status: "ready", persistence: fakePersistence });
    expect(fakeDatabase.execute).toHaveBeenCalled();
  });

  it("is a no-op when persistence is unavailable", async () => {
    openDatabase.mockRejectedValue(new PersistenceUnavailableError("no OPFS"));
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    try {
      await wipePersistedData();
      expect(fakeDatabase.execute).not.toHaveBeenCalled();
    } finally {
      infoSpy.mockRestore();
    }
  });

  it("warns instead of throwing when the wipe fails", async () => {
    fakeDatabase.execute.mockRejectedValue(new Error("disk gone"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await expect(wipePersistedData()).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledOnce();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
