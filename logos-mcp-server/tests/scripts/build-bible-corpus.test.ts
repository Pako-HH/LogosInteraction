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
