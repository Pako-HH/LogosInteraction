import { describe, it, expect, afterAll, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

// Mutable path holder so each test can point DB_PATHS.history at a
// different fixture file without re-mocking per test.
const mockDbPaths: { history: string } = { history: "" };

vi.mock("../src/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config.js")>();
  return {
    ...actual,
    DB_PATHS: new Proxy(actual.DB_PATHS, {
      get(target, prop) {
        if (prop === "history") return mockDbPaths.history;
        return (target as Record<string, unknown>)[prop as string];
      },
    }),
  };
});

const { getHistory } = await import("../src/services/sqlite-reader.js");

const testDir = mkdtempSync(join(tmpdir(), "logos-mcp-history-test-"));

function freshHistoryPath(): string {
  // Each fixture gets its own file — better-sqlite3 validates file format
  // lazily (on first statement, not on open), and reusing a path across
  // tests would also collide on CREATE TABLE.
  return join(testDir, `history-${randomUUID()}.db`);
}

function createFixtureHistory(
  path: string,
  rows: Array<{
    Id: string;
    Title: string;
    Subtitle: string;
    LastVisited: string;
    Bookmark: string;
    ParentId: string | null;
    SyncState: number;
    IsDeleted: number;
    SyncRevision: number | null;
  }>
): void {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE History (
      Id text primary key,
      Title text not null,
      Subtitle text not null,
      LastVisited text not null,
      Bookmark text not null,
      ParentId text,
      SyncState int not null default 1,
      IsDeleted bool not null default 0,
      SyncRevision integer null default null
    );
  `);
  const insert = db.prepare(`
    INSERT INTO History (Id, Title, Subtitle, LastVisited, Bookmark, ParentId, SyncState, IsDeleted, SyncRevision)
    VALUES (@Id, @Title, @Subtitle, @LastVisited, @Bookmark, @ParentId, @SyncState, @IsDeleted, @SyncRevision)
  `);
  for (const row of rows) insert.run(row);
  db.close();
}

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("getHistory", () => {
  describe("happy path (fixture history)", () => {
    function seed() {
      const historyPath = freshHistoryPath();
      mockDbPaths.history = historyPath;
      createFixtureHistory(historyPath, [
        {
          Id: "11111111-1111-1111-1111-111111111111",
          Title: "Römer",
          Subtitle: "Römer 5,12–21",
          LastVisited: "2026-07-20T20:18:05Z",
          Bookmark: "Resource|Id=LLS:BFRTFRGTTRMR57",
          ParentId: "00000000-0000-0000-0000-000000000000",
          SyncState: 3,
          IsDeleted: 0,
          SyncRevision: 1,
        },
        {
          Id: "22222222-2222-2222-2222-222222222222",
          Title: "Psalmen",
          Subtitle: "Psalm 51",
          LastVisited: "2026-07-21T05:45:51Z",
          Bookmark: "Resource|Id=LLS:KMMNTRZDNPS4272",
          ParentId: "00000000-0000-0000-0000-000000000000",
          SyncState: 3,
          IsDeleted: 0,
          SyncRevision: 1,
        },
        {
          // Must be excluded regardless of how recent it is.
          Id: "33333333-3333-3333-3333-333333333333",
          Title: "Gelöschter Eintrag",
          Subtitle: "sollte nicht erscheinen",
          LastVisited: "2026-07-21T06:00:00Z",
          Bookmark: "Resource|Id=LLS:DELETED",
          ParentId: "00000000-0000-0000-0000-000000000000",
          SyncState: 3,
          IsDeleted: 1,
          SyncRevision: 1,
        },
      ]);
    }

    it("orders results by LastVisited descending", () => {
      seed();
      const history = getHistory();
      expect(history.map((h) => h.id)).toEqual([
        "22222222-2222-2222-2222-222222222222",
        "11111111-1111-1111-1111-111111111111",
      ]);
    });

    it("excludes soft-deleted entries", () => {
      seed();
      const history = getHistory();
      expect(history.map((h) => h.id)).not.toContain("33333333-3333-3333-3333-333333333333");
    });

    it("maps fields correctly for a normal row", () => {
      seed();
      const history = getHistory();
      const romans = history.find((h) => h.id === "11111111-1111-1111-1111-111111111111");
      expect(romans).toEqual({
        id: "11111111-1111-1111-1111-111111111111",
        title: "Römer",
        subtitle: "Römer 5,12–21",
        lastVisited: "2026-07-20T20:18:05Z",
      });
    });

    it("respects the limit parameter", () => {
      seed();
      const history = getHistory(1);
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe("22222222-2222-2222-2222-222222222222");
    });

    it("returns all non-deleted entries when no limit is given", () => {
      seed();
      expect(getHistory()).toHaveLength(2);
    });
  });

  describe("empty history", () => {
    it("returns an empty array without throwing when no rows exist", () => {
      const historyPath = freshHistoryPath();
      mockDbPaths.history = historyPath;
      createFixtureHistory(historyPath, []);
      expect(getHistory()).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("throws when the history database file does not exist", () => {
      const missingPath = join(testDir, "does-not-exist", "history.db");
      mockDbPaths.history = missingPath;
      expect(() => getHistory()).toThrowError(/Database not found/);
    });
  });
});
