import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

// Mutable path holder so each test can point DB_PATHS.catalog at a
// different fixture file without re-mocking per test.
const mockDbPaths: { catalog: string } = { catalog: "" };

vi.mock("../src/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config.js")>();
  return {
    ...actual,
    DB_PATHS: new Proxy(actual.DB_PATHS, {
      get(target, prop) {
        if (prop === "catalog") return mockDbPaths.catalog;
        return (target as Record<string, unknown>)[prop as string];
      },
    }),
  };
});

const { getInstalledBibles, getResourceTitles } = await import("../src/services/catalog-reader.js");

const testDir = mkdtempSync(join(tmpdir(), "logos-mcp-catalog-test-"));

function freshCatalogPath(): string {
  // Each fixture gets its own file — better-sqlite3 validates file format
  // lazily (on first statement, not on open), and reusing a path across
  // tests would also collide on CREATE TABLE.
  return join(testDir, `catalog-${randomUUID()}.db`);
}

function createFixtureCatalog(
  path: string,
  rows: Array<{
    ResourceId: string;
    Title: string;
    AbbreviatedTitle: string | null;
    Type: string;
    Languages: string | null;
    Publishers: string | null;
    Availability: number;
    IsDataset: number;
  }>
): void {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE Records (
      ResourceId TEXT,
      Title TEXT,
      AbbreviatedTitle TEXT,
      Type TEXT,
      Languages TEXT,
      Publishers TEXT,
      Availability INT,
      IsDataset BOOLEAN
    );
  `);
  const insert = db.prepare(`
    INSERT INTO Records (ResourceId, Title, AbbreviatedTitle, Type, Languages, Publishers, Availability, IsDataset)
    VALUES (@ResourceId, @Title, @AbbreviatedTitle, @Type, @Languages, @Publishers, @Availability, @IsDataset)
  `);
  for (const row of rows) insert.run(row);
  db.close();
}

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("getInstalledBibles", () => {
  describe("happy path (fixture catalog)", () => {
    beforeEach(() => {
      const catalogPath = freshCatalogPath();
      mockDbPaths.catalog = catalogPath;
      createFixtureCatalog(catalogPath, [
        {
          ResourceId: "LLS:LEB",
          Title: "The Lexham English Bible",
          AbbreviatedTitle: "LEB",
          Type: "text.monograph.bible",
          Languages: "en",
          Publishers: "Lexham Press",
          Availability: 2,
          IsDataset: 0,
        },
        {
          ResourceId: "LLS:NEU",
          Title: "Neue evangelistische Übersetzung",
          AbbreviatedTitle: "NeÜ",
          Type: "text.monograph.bible",
          Languages: "de",
          Publishers: null,
          Availability: 2,
          IsDataset: 0,
        },
        {
          // Not a Bible translation — must be excluded
          ResourceId: "LLS:SOMECOMM",
          Title: "Some Commentary",
          AbbreviatedTitle: "SC",
          Type: "text.monograph.commentary.bible",
          Languages: "en",
          Publishers: "Someone",
          Availability: 2,
          IsDataset: 0,
        },
        {
          // Not yet downloaded — must be excluded
          ResourceId: "LLS:NOTDOWNLOADED",
          Title: "Not Downloaded Bible",
          AbbreviatedTitle: null,
          Type: "text.monograph.bible",
          Languages: "en",
          Publishers: "Someone",
          Availability: 0,
          IsDataset: 0,
        },
        {
          // Dataset entry, not a browsable resource — must be excluded
          ResourceId: "LLS:DATASETBIBLE",
          Title: "Dataset Bible",
          AbbreviatedTitle: null,
          Type: "text.monograph.bible",
          Languages: "en",
          Publishers: "Someone",
          Availability: 2,
          IsDataset: 1,
        },
        {
          // Real catalogs have a handful of Bible entries with no
          // AbbreviatedTitle at all — must not crash, must surface as null.
          ResourceId: "LLS:NOABBR",
          Title: "Untitled Bible",
          AbbreviatedTitle: null,
          Type: "text.monograph.bible",
          Languages: "en",
          Publishers: "Someone",
          Availability: 2,
          IsDataset: 0,
        },
        {
          // Defensive: multi-value delimited fields, though not observed in
          // real catalogs — must still split cleanly.
          ResourceId: "LLS:MULTI",
          Title: "Multilingual Bible",
          AbbreviatedTitle: "MB",
          Type: "text.monograph.bible",
          Languages: "en, fr",
          Publishers: "Pub One; Pub Two",
          Availability: 2,
          IsDataset: 0,
        },
      ]);
    });

    it("only returns Type='text.monograph.bible' entries", () => {
      const bibles = getInstalledBibles();
      const ids = bibles.map((b) => b.resourceId);
      expect(ids).not.toContain("LLS:SOMECOMM");
    });

    it("excludes unavailable (not downloaded) resources", () => {
      const bibles = getInstalledBibles();
      expect(bibles.map((b) => b.resourceId)).not.toContain("LLS:NOTDOWNLOADED");
    });

    it("excludes dataset entries", () => {
      const bibles = getInstalledBibles();
      expect(bibles.map((b) => b.resourceId)).not.toContain("LLS:DATASETBIBLE");
    });

    it("maps fields correctly for a normal row", () => {
      const bibles = getInstalledBibles();
      const leb = bibles.find((b) => b.resourceId === "LLS:LEB");
      expect(leb).toEqual({
        resourceId: "LLS:LEB",
        title: "The Lexham English Bible",
        abbreviatedTitle: "LEB",
        languages: ["en"],
        publishers: ["Lexham Press"],
      });
    });

    it("handles a null Publishers field gracefully", () => {
      const bibles = getInstalledBibles();
      const neu = bibles.find((b) => b.resourceId === "LLS:NEU");
      expect(neu?.abbreviatedTitle).toBe("NeÜ");
      expect(neu?.publishers).toEqual([]);
    });

    it("handles a null AbbreviatedTitle field gracefully", () => {
      const bibles = getInstalledBibles("Untitled Bible");
      const untitled = bibles.find((b) => b.resourceId === "LLS:NOABBR");
      expect(untitled?.abbreviatedTitle).toBeNull();
    });

    it("splits delimited multi-value language/publisher fields", () => {
      const bibles = getInstalledBibles();
      const multi = bibles.find((b) => b.resourceId === "LLS:MULTI");
      expect(multi?.languages).toEqual(["en", "fr"]);
      expect(multi?.publishers).toEqual(["Pub One", "Pub Two"]);
    });

    it("filters by query across title/abbreviation/language", () => {
      const bibles = getInstalledBibles("Lexham");
      expect(bibles.map((b) => b.resourceId)).toEqual(["LLS:LEB"]);
    });

    it("returns an empty array when the query matches nothing", () => {
      expect(getInstalledBibles("NoSuchTranslationXYZ")).toEqual([]);
    });
  });

  describe("empty catalog", () => {
    it("returns an empty array without throwing when no Bible rows exist", () => {
      const catalogPath = freshCatalogPath();
      mockDbPaths.catalog = catalogPath;
      createFixtureCatalog(catalogPath, []);
      expect(getInstalledBibles()).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("throws a clean, path-free error when the catalog file does not exist", () => {
      const missingPath = join(testDir, "does-not-exist", "catalog.db");
      mockDbPaths.catalog = missingPath;
      expect(() => getInstalledBibles()).toThrowError(/Logos library catalog was not found/);
      try {
        getInstalledBibles();
        expect.unreachable("expected getInstalledBibles to throw");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        expect(msg).not.toContain(missingPath);
        expect(msg).not.toContain(testDir);
      }
    });

    it("throws a clean error when the file is not a valid SQLite database", () => {
      // better-sqlite3 validates file format lazily, on the first statement
      // (open itself succeeds even for a garbage file) — see catalog-reader.ts.
      const corruptPath = freshCatalogPath();
      writeFileSync(corruptPath, "this is not a sqlite database file");
      mockDbPaths.catalog = corruptPath;
      expect(() => getInstalledBibles()).toThrowError(/could not be read/);
    });

    it("throws a clean error when the Records table/columns don't match the expected structure", () => {
      const wrongSchemaPath = freshCatalogPath();
      const db = new Database(wrongSchemaPath);
      db.exec(`CREATE TABLE Records (SomeOtherColumn TEXT);`);
      db.close();
      mockDbPaths.catalog = wrongSchemaPath;
      expect(() => getInstalledBibles()).toThrowError(/unexpected structure/);
    });
  });
});

describe("getResourceTitles", () => {
  function seed() {
    const catalogPath = freshCatalogPath();
    mockDbPaths.catalog = catalogPath;
    createFixtureCatalog(catalogPath, [
      {
        ResourceId: "LLS:LEB",
        Title: "The Lexham English Bible",
        AbbreviatedTitle: "LEB",
        Type: "text.monograph.bible",
        Languages: "en",
        Publishers: "Lexham Press",
        Availability: 2,
        IsDataset: 0,
      },
      {
        ResourceId: "LLS:NEU",
        Title: "Neue evangelistische Übersetzung",
        AbbreviatedTitle: "NeÜ",
        Type: "text.monograph.bible",
        Languages: "de",
        Publishers: null,
        Availability: 2,
        IsDataset: 0,
      },
    ]);
  }

  it("returns titles for all requested IDs when every ID is found", () => {
    seed();
    const titles = getResourceTitles(["LLS:LEB", "LLS:NEU"]);
    expect(titles.get("LLS:LEB")).toBe("The Lexham English Bible");
    expect(titles.get("LLS:NEU")).toBe("Neue evangelistische Übersetzung");
  });

  it("omits IDs with no catalog match instead of throwing", () => {
    seed();
    const titles = getResourceTitles(["LLS:LEB", "LLS:DOES-NOT-EXIST"]);
    expect(titles.get("LLS:LEB")).toBe("The Lexham English Bible");
    expect(titles.has("LLS:DOES-NOT-EXIST")).toBe(false);
    expect(titles.size).toBe(1);
  });

  it("returns an empty map for an empty input array without touching the database", () => {
    mockDbPaths.catalog = join(testDir, "does-not-exist", "catalog.db");
    const titles = getResourceTitles([]);
    expect(titles).toEqual(new Map());
  });

  it("handles duplicate IDs in the input without error", () => {
    seed();
    const titles = getResourceTitles(["LLS:LEB", "LLS:LEB"]);
    expect(titles.get("LLS:LEB")).toBe("The Lexham English Bible");
    expect(titles.size).toBe(1);
  });
});
