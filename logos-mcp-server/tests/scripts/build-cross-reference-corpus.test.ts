import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { BOOK_ORDER } from "../../src/services/reference-parser.js";
import {
  OPENBIBLE_TO_CANONICAL_BOOK,
  validateOpenBibleMapping,
  parseCrossReferenceLine,
  parseCrossReferenceText,
  createCrossReferenceCorpusDb,
  insertCrossReferences,
  type RawCrossReference,
} from "../../scripts/build-cross-reference-corpus.js";

describe("parseCrossReferenceLine", () => {
  it("parses a normal single-verse-to-single-verse line", () => {
    expect(parseCrossReferenceLine("Gen.1.1\tPs.8.3\t73")).toEqual({
      from: { bookCode: "Gen", chapter: 1, verse: 1 },
      to: { bookCode: "Ps", chapter: 8, verse: 3 },
      toEnd: { bookCode: "Ps", chapter: 8, verse: 3 },
      votes: 73,
    });
  });

  it("parses a same-book, same-chapter range on the To Verse side", () => {
    expect(parseCrossReferenceLine("Ps.23.1\tPs.34.9-Ps.34.10\t115")).toEqual({
      from: { bookCode: "Ps", chapter: 23, verse: 1 },
      to: { bookCode: "Ps", chapter: 34, verse: 9 },
      toEnd: { bookCode: "Ps", chapter: 34, verse: 10 },
      votes: 115,
    });
  });

  it("parses a same-book, cross-chapter range on the To Verse side", () => {
    expect(parseCrossReferenceLine("Ps.23.1\tPs.79.13-Ps.80.1\t59")).toEqual({
      from: { bookCode: "Ps", chapter: 23, verse: 1 },
      to: { bookCode: "Ps", chapter: 79, verse: 13 },
      toEnd: { bookCode: "Ps", chapter: 80, verse: 1 },
      votes: 59,
    });
  });

  it("parses a cross-book range on the To Verse side (rare but present in the real dataset, see docs/30)", () => {
    expect(parseCrossReferenceLine("Gen.1.1\t1Kgs.22.53-2Kgs.1.1\t5")).toEqual({
      from: { bookCode: "Gen", chapter: 1, verse: 1 },
      to: { bookCode: "1Kgs", chapter: 22, verse: 53 },
      toEnd: { bookCode: "2Kgs", chapter: 1, verse: 1 },
      votes: 5,
    });
  });

  it("parses negative votes (community downvotes are valid, not malformed input)", () => {
    expect(parseCrossReferenceLine("Gen.1.1\tExod.31.18\t-38")).toEqual({
      from: { bookCode: "Gen", chapter: 1, verse: 1 },
      to: { bookCode: "Exod", chapter: 31, verse: 18 },
      toEnd: { bookCode: "Exod", chapter: 31, verse: 18 },
      votes: -38,
    });
  });

  it("returns null for a line with the wrong number of tab-separated fields (e.g. the header row)", () => {
    expect(parseCrossReferenceLine("From Verse\tTo Verse\tVotes\t#www.openbible.info CC-BY 2026-07-13")).toBeNull();
  });

  it("returns null for a reference with the wrong number of dot-separated parts", () => {
    expect(parseCrossReferenceLine("Gen.1\tPs.8.3\t73")).toBeNull();
  });

  it("returns null for a non-numeric votes field", () => {
    expect(parseCrossReferenceLine("Gen.1.1\tPs.8.3\tVotes")).toBeNull();
  });
});

describe("parseCrossReferenceText", () => {
  it("skips the header row and parses the remaining data rows", () => {
    const content = [
      "From Verse\tTo Verse\tVotes\t#www.openbible.info CC-BY 2026-07-13",
      "Gen.1.1\tPs.8.3\t73",
      "Gen.1.1\tRom.11.36\t62",
    ].join("\n");
    const refs = parseCrossReferenceText(content);
    expect(refs).toEqual([
      {
        fromBook: "Genesis", fromChapter: 1, fromVerse: 1,
        toBook: "Psalms", toChapter: 8, toVerse: 3,
        toEndBook: "Psalms", toEndChapter: 8, toEndVerse: 3,
        votes: 73,
      },
      {
        fromBook: "Genesis", fromChapter: 1, fromVerse: 1,
        toBook: "Romans", toChapter: 11, toVerse: 36,
        toEndBook: "Romans", toEndChapter: 11, toEndVerse: 36,
        votes: 62,
      },
    ]);
  });

  it("skips blank lines", () => {
    const content = ["header (ignored)", "Gen.1.1\tPs.8.3\t73", "", "Gen.1.1\tRom.11.36\t62"].join("\n");
    const refs = parseCrossReferenceText(content);
    expect(refs).toHaveLength(2);
  });

  it("maps openbible.info book codes to the same canonical book names used by reference-parser.ts", () => {
    const content = ["header (ignored)", "1Cor.13.4\tJohn.3.16\t1"].join("\n");
    const refs = parseCrossReferenceText(content);
    expect(refs[0].fromBook).toBe("1 Corinthians");
    expect(refs[0].toBook).toBe("John");
    expect(BOOK_ORDER).toContain(refs[0].fromBook);
    expect(BOOK_ORDER).toContain(refs[0].toBook);
  });

  it("filters out entries with an unmapped (non-canonical) book code", () => {
    const content = ["header (ignored)", "Gen.1.1\tPs.8.3\t73", "Xyz.1.1\tGen.1.1\t1"].join("\n");
    const refs = parseCrossReferenceText(content);
    expect(refs).toHaveLength(1);
    expect(refs[0].fromBook).toBe("Genesis");
  });

  it("throws on a genuinely malformed non-header, non-blank line", () => {
    const content = ["header (ignored)", "this line has no tabs at all"].join("\n");
    expect(() => parseCrossReferenceText(content)).toThrow(/Unparseable cross-reference line/);
  });
});

describe("OPENBIBLE_TO_CANONICAL_BOOK / validateOpenBibleMapping", () => {
  it("has exactly 66 entries", () => {
    expect(Object.keys(OPENBIBLE_TO_CANONICAL_BOOK)).toHaveLength(66);
  });

  it("maps onto exactly the 66 canonical books in BOOK_ORDER, with no duplicates or extras", () => {
    const mappedBooks = Object.values(OPENBIBLE_TO_CANONICAL_BOOK).slice().sort();
    const canonicalBooks = BOOK_ORDER.slice().sort();
    expect(mappedBooks).toEqual(canonicalBooks);
  });

  it("validateOpenBibleMapping() does not throw for the real, in-sync table", () => {
    expect(() => validateOpenBibleMapping()).not.toThrow();
  });
});

describe("createCrossReferenceCorpusDb + insertCrossReferences", () => {
  function fixtureRefs(): RawCrossReference[] {
    return [
      {
        fromBook: "John", fromChapter: 3, fromVerse: 16,
        toBook: "Romans", toChapter: 5, toVerse: 8,
        toEndBook: "Romans", toEndChapter: 5, toEndVerse: 8,
        votes: 977,
      },
      {
        fromBook: "Genesis", fromChapter: 1, fromVerse: 1,
        toBook: "Proverbs", toChapter: 8, toVerse: 22,
        toEndBook: "Proverbs", toEndChapter: 8, toEndVerse: 30,
        votes: 76,
      },
    ];
  }

  it("creates the cross_references schema and inserts rows", () => {
    const db = createCrossReferenceCorpusDb(":memory:");
    insertCrossReferences(db, fixtureRefs());
    const row = db.prepare("SELECT COUNT(*) AS n FROM cross_references").get() as { n: number };
    expect(row.n).toBe(2);
    db.close();
  });

  it("stores range and vote data correctly, including negative votes", () => {
    const db = createCrossReferenceCorpusDb(":memory:");
    insertCrossReferences(db, [
      {
        fromBook: "Genesis", fromChapter: 1, fromVerse: 1,
        toBook: "Exodus", toChapter: 31, toVerse: 18,
        toEndBook: "Exodus", toEndChapter: 31, toEndVerse: 18,
        votes: -38,
      },
    ]);
    const row = db.prepare("SELECT * FROM cross_references").get() as Record<string, unknown>;
    expect(row.votes).toBe(-38);
    expect(row.to_book).toBe("Exodus");
    expect(row.to_end_book).toBe("Exodus");
    db.close();
  });

  it("enforces the UNIQUE(from_book, from_chapter, from_verse, to_book, to_chapter, to_verse) constraint", () => {
    const db = createCrossReferenceCorpusDb(":memory:");
    insertCrossReferences(db, fixtureRefs());
    expect(() => insertCrossReferences(db, [fixtureRefs()[0]])).toThrow();
    db.close();
  });

  it("looks up cross-references for a given from-reference via the from-side index", () => {
    const db = createCrossReferenceCorpusDb(":memory:");
    insertCrossReferences(db, fixtureRefs());
    const hits = db
      .prepare(
        "SELECT to_book, to_chapter, to_verse FROM cross_references WHERE from_book = ? AND from_chapter = ? AND from_verse = ?"
      )
      .all("John", 3, 16) as Array<{ to_book: string; to_chapter: number; to_verse: number }>;
    expect(hits).toEqual([{ to_book: "Romans", to_chapter: 5, to_verse: 8 }]);
    db.close();
  });
});
