import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { BOOK_ORDER } from "../../src/services/reference-parser.js";
import {
  SIL_TO_CANONICAL_BOOK,
  validateSilMapping,
  parseVplLine,
  parseVplText,
  checkCompleteness,
  createCorpusDb,
  insertCorpusVerses,
  type RawVerse,
} from "../../scripts/build-bible-corpus.js";

describe("parseVplLine", () => {
  it("parses a normal verse line", () => {
    expect(parseVplLine("GEN 1:1 In the beginning, God created the heavens and the earth.")).toEqual({
      silCode: "GEN",
      chapter: 1,
      verse: 1,
      text: "In the beginning, God created the heavens and the earth.",
    });
  });

  it("parses multi-digit chapter and verse numbers (Psalm 119:176)", () => {
    expect(parseVplLine("PSA 119:176 I have gone astray like a lost sheep.")).toEqual({
      silCode: "PSA",
      chapter: 119,
      verse: 176,
      text: "I have gone astray like a lost sheep.",
    });
  });

  it("parses a line with empty verse text (e.g. Romans 16:25 in this WEB edition)", () => {
    expect(parseVplLine("ROM 16:25 ")).toEqual({
      silCode: "ROM",
      chapter: 16,
      verse: 25,
      text: "",
    });
  });

  it("returns null for a malformed line (no chapter:verse)", () => {
    expect(parseVplLine("GEN this is not a reference")).toBeNull();
  });

  it("returns null for a malformed line (comma instead of colon)", () => {
    expect(parseVplLine("GEN 1,1 In the beginning...")).toBeNull();
  });
});

describe("parseVplText", () => {
  it("parses multiple lines and skips blank lines", () => {
    const content = [
      "GEN 1:1 In the beginning, God created the heavens and the earth.",
      "",
      "GEN 1:2 The earth was formless and empty.",
    ].join("\n");
    const verses = parseVplText(content);
    expect(verses).toEqual([
      { book: "Genesis", chapter: 1, verse: 1, text: "In the beginning, God created the heavens and the earth." },
      { book: "Genesis", chapter: 1, verse: 2, text: "The earth was formless and empty." },
    ]);
  });

  it("filters out non-canonical (Apocrypha/Deuterocanon) book codes", () => {
    const content = [
      "GEN 1:1 In the beginning, God created the heavens and the earth.",
      "TOB 1:1 The book of the words of Tobit.",
      "SIR 1:1 All wisdom is from the Lord.",
    ].join("\n");
    const verses = parseVplText(content);
    expect(verses.map((v) => v.book)).toEqual(["Genesis"]);
  });

  it("maps SIL codes to the same canonical book names used by reference-parser.ts", () => {
    const content = "1CO 13:4 Love is patient and is kind.";
    const verses = parseVplText(content);
    expect(verses[0].book).toBe("1 Corinthians");
    expect(BOOK_ORDER).toContain(verses[0].book);
  });

  it("throws on a genuinely malformed non-blank line", () => {
    expect(() => parseVplText("this line has no reference at all")).toThrow(/Unparseable VPL line/);
  });
});

describe("SIL_TO_CANONICAL_BOOK / validateSilMapping", () => {
  it("has exactly 66 entries", () => {
    expect(Object.keys(SIL_TO_CANONICAL_BOOK)).toHaveLength(66);
  });

  it("maps onto exactly the 66 canonical books in BOOK_ORDER, with no duplicates or extras", () => {
    const mappedBooks = Object.values(SIL_TO_CANONICAL_BOOK).slice().sort();
    const canonicalBooks = BOOK_ORDER.slice().sort();
    expect(mappedBooks).toEqual(canonicalBooks);
  });

  it("validateSilMapping() does not throw for the real, in-sync table", () => {
    expect(() => validateSilMapping()).not.toThrow();
  });
});

describe("checkCompleteness", () => {
  it("reports no issues when verse counts match versification.ts exactly", () => {
    // Obadiah: single chapter, 21 verses (small, easy to fully enumerate).
    const verses: RawVerse[] = Array.from({ length: 21 }, (_, i) => ({
      book: "Obadiah",
      chapter: 1,
      verse: i + 1,
      text: `verse ${i + 1}`,
    }));
    const issues = checkCompleteness(verses).filter((i) => i.book === "Obadiah");
    expect(issues).toEqual([]);
  });

  it("reports a mismatch when a chapter has the wrong verse count", () => {
    // Obadiah 1 has 20 verses here instead of the expected 21.
    const verses: RawVerse[] = Array.from({ length: 20 }, (_, i) => ({
      book: "Obadiah",
      chapter: 1,
      verse: i + 1,
      text: `verse ${i + 1}`,
    }));
    const issues = checkCompleteness(verses).filter((i) => i.book === "Obadiah");
    expect(issues).toEqual([{ book: "Obadiah", chapter: 1, expected: 21, actual: 20 }]);
  });

  it("reports every chapter of a book as missing (actual: 0) when the book is entirely absent", () => {
    const issues = checkCompleteness([]).filter((i) => i.book === "Philemon");
    expect(issues).toEqual([{ book: "Philemon", chapter: 1, expected: 25, actual: 0 }]);
  });
});

describe("createCorpusDb + insertCorpusVerses", () => {
  function fixtureVerses(): RawVerse[] {
    return [
      { book: "John", chapter: 3, verse: 16, text: "For God so loved the world..." },
      { book: "Genesis", chapter: 1, verse: 1, text: "In the beginning, God created the heavens and the earth." },
    ];
  }

  it("creates the verses + verses_fts schema and inserts rows", () => {
    const db = createCorpusDb(":memory:");
    insertCorpusVerses(db, "WEB", fixtureVerses());
    const row = db.prepare("SELECT COUNT(*) AS n FROM verses").get() as { n: number };
    expect(row.n).toBe(2);
    db.close();
  });

  it("enforces the UNIQUE(translation, book, chapter, verse) constraint", () => {
    const db = createCorpusDb(":memory:");
    insertCorpusVerses(db, "WEB", [{ book: "John", chapter: 3, verse: 16, text: "first" }]);
    expect(() =>
      insertCorpusVerses(db, "WEB", [{ book: "John", chapter: 3, verse: 16, text: "duplicate" }])
    ).toThrow();
    db.close();
  });

  it("allows the same (book, chapter, verse) across different translations", () => {
    const db = createCorpusDb(":memory:");
    insertCorpusVerses(db, "WEB", [{ book: "John", chapter: 3, verse: 16, text: "WEB text" }]);
    expect(() =>
      insertCorpusVerses(db, "KJV", [{ book: "John", chapter: 3, verse: 16, text: "KJV text" }])
    ).not.toThrow();
    const row = db.prepare("SELECT COUNT(*) AS n FROM verses").get() as { n: number };
    expect(row.n).toBe(2);
    db.close();
  });

  it("makes inserted verse text searchable via FTS5", () => {
    const db = createCorpusDb(":memory:");
    insertCorpusVerses(db, "WEB", fixtureVerses());
    const hits = db
      .prepare(
        `SELECT v.book, v.chapter, v.verse FROM verses_fts JOIN verses v ON v.id = verses_fts.rowid WHERE verses_fts MATCH ?`
      )
      .all("beginning") as Array<{ book: string; chapter: number; verse: number }>;
    expect(hits).toEqual([{ book: "Genesis", chapter: 1, verse: 1 }]);
    db.close();
  });
});

// Phase 3D-3: building a combined WEB+KJV+ASV corpus means running this
// pipeline once per translation against the same output file — these
// tests exercise that exact workflow with small fixtures, mirroring the
// real multi-translation build without depending on the real ~93,300-verse
// source data (which, like the WEB source in Phase 3D-2, is intentionally
// not committed to the repo).
describe("Phase 3D-3 — combined multi-translation corpus", () => {
  const webVerses: RawVerse[] = [
    { book: "Genesis", chapter: 1, verse: 1, text: "In the beginning, God created the heavens and the earth." },
    { book: "John", chapter: 3, verse: 16, text: "For God so loved the world, that he gave his only born Son..." },
  ];
  const kjvVerses: RawVerse[] = [
    { book: "Genesis", chapter: 1, verse: 1, text: "In the beginning God created the heaven and the earth." },
    { book: "John", chapter: 3, verse: 16, text: "For God so loved the world, that he gave his only begotten Son..." },
  ];
  const asvVerses: RawVerse[] = [
    { book: "Genesis", chapter: 1, verse: 1, text: "In the beginning God created the heavens and the earth." },
  ];

  it("accumulates three translations into one file across three separate build runs (same workflow as the real CLI)", () => {
    const db = createCorpusDb(":memory:");
    insertCorpusVerses(db, "WEB", webVerses);
    insertCorpusVerses(db, "KJV", kjvVerses);
    insertCorpusVerses(db, "ASV", asvVerses);

    const total = db.prepare("SELECT COUNT(*) AS n FROM verses").get() as { n: number };
    expect(total.n).toBe(5); // 2 + 2 + 1

    const perTranslation = db
      .prepare("SELECT translation, COUNT(*) AS n FROM verses GROUP BY translation ORDER BY translation")
      .all() as Array<{ translation: string; n: number }>;
    expect(perTranslation).toEqual([
      { translation: "ASV", n: 1 },
      { translation: "KJV", n: 2 },
      { translation: "WEB", n: 2 },
    ]);
    db.close();
  });

  it("keeps each translation's own wording independently retrievable for the same reference", () => {
    const db = createCorpusDb(":memory:");
    insertCorpusVerses(db, "WEB", webVerses);
    insertCorpusVerses(db, "KJV", kjvVerses);

    const web = db
      .prepare("SELECT text FROM verses WHERE translation = 'WEB' AND book = 'John' AND chapter = 3 AND verse = 16")
      .get() as { text: string };
    const kjv = db
      .prepare("SELECT text FROM verses WHERE translation = 'KJV' AND book = 'John' AND chapter = 3 AND verse = 16")
      .get() as { text: string };
    expect(web.text).toContain("only born Son");
    expect(kjv.text).toContain("only begotten Son");
    db.close();
  });

  it("FTS5 search can be filtered to a single translation", () => {
    const db = createCorpusDb(":memory:");
    insertCorpusVerses(db, "WEB", webVerses);
    insertCorpusVerses(db, "KJV", kjvVerses);

    const kjvOnly = db
      .prepare(
        `SELECT v.translation FROM verses_fts JOIN verses v ON v.id = verses_fts.rowid WHERE verses_fts MATCH 'begotten' AND v.translation = 'KJV'`
      )
      .all() as Array<{ translation: string }>;
    expect(kjvOnly).toEqual([{ translation: "KJV" }]);

    // WEB never says "begotten" in this fixture — searching WEB-only for it must find nothing.
    const webOnly = db
      .prepare(
        `SELECT v.translation FROM verses_fts JOIN verses v ON v.id = verses_fts.rowid WHERE verses_fts MATCH 'begotten' AND v.translation = 'WEB'`
      )
      .all();
    expect(webOnly).toEqual([]);
  });

  it("rejects an accidental duplicate build run of the same translation (idempotency safety net)", () => {
    const db = createCorpusDb(":memory:");
    insertCorpusVerses(db, "KJV", kjvVerses);
    // Simulates re-running `tsx scripts/build-bible-corpus.ts KJV ...` a
    // second time against the same output file by mistake.
    expect(() => insertCorpusVerses(db, "KJV", kjvVerses)).toThrow();
    db.close();
  });
});
