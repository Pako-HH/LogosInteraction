import { describe, it, expect } from "vitest";
import { VERSE_COUNTS, versesInChapter, chapterCount } from "../src/data/versification.js";
import { BOOK_ORDER } from "../src/services/reference-parser.js";

describe("versification data integrity", () => {
  it("has exactly the 66 canonical books, matching BOOK_ORDER", () => {
    const keys = Object.keys(VERSE_COUNTS);
    expect(keys).toHaveLength(66);
    expect(new Set(keys)).toEqual(new Set(BOOK_ORDER));
  });

  it("totals 1189 chapters across all books (standard canon total)", () => {
    const total = Object.values(VERSE_COUNTS).reduce((sum, chapters) => sum + chapters.length, 0);
    expect(total).toBe(1189);
  });

  it("totals 31102 verses across all books (standard KJV total)", () => {
    const total = Object.values(VERSE_COUNTS).reduce(
      (sum, chapters) => sum + chapters.reduce((a, c) => a + c, 0),
      0
    );
    expect(total).toBe(31102);
  });

  it("matches well-known per-book verse totals (spot check)", () => {
    const knownTotals: Record<string, number> = {
      Genesis: 1533,
      Psalms: 2461,
      Isaiah: 1292,
      Matthew: 1071,
      John: 879,
      Revelation: 404,
      Philemon: 25,
      Jude: 25,
      "2 John": 13,
    };
    for (const [book, expected] of Object.entries(knownTotals)) {
      const actual = VERSE_COUNTS[book].reduce((a, c) => a + c, 0);
      expect(actual, `${book} total verses`).toBe(expected);
    }
  });

  it("matches well-known single-chapter verse counts (spot check)", () => {
    expect(versesInChapter("Psalms", 119)).toBe(176); // longest chapter
    expect(versesInChapter("Psalms", 117)).toBe(2); // shortest chapter
    expect(versesInChapter("John", 3)).toBe(36);
    expect(versesInChapter("Genesis", 1)).toBe(31);
    expect(versesInChapter("Esther", 8)).toBe(17);
  });
});

describe("chapterCount / versesInChapter", () => {
  it("returns the correct chapter count for a multi-chapter book", () => {
    expect(chapterCount("Romans")).toBe(16);
  });

  it("returns 1 for single-chapter books", () => {
    expect(chapterCount("Jude")).toBe(1);
    expect(chapterCount("Obadiah")).toBe(1);
  });

  it("returns null for an unknown book", () => {
    expect(chapterCount("Not A Book")).toBeNull();
    expect(versesInChapter("Not A Book", 1)).toBeNull();
  });

  it("returns null for a chapter number beyond the book's length", () => {
    expect(versesInChapter("Jude", 2)).toBeNull();
  });
});
