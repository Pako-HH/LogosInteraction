// Phase 3C verification spike tests.
//
// STATUS: Spike-only tests against the isolated prototype in
// logos-mcp-server/spike/. Not testing any production code path (no
// LocalBibleProvider exists yet); testing reference-parser.ts/
// versification.ts (real, existing modules) composed with a throwaway
// SQLite+FTS5 database seeded from spike/fixtures/web-sample-verses.ts.
// Findings are written up in docs/18_Phase3C_Verifikations_Spike.md.

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import {
  createSpikeDb,
  insertVerses,
  lookupVerse,
  lookupRange,
  searchText,
  checkVersification,
} from "../../spike/corpus-prototype.js";
import { WEB_SAMPLE_VERSES } from "../../spike/fixtures/web-sample-verses.js";
import { parseReference } from "../../src/services/reference-parser.js";

describe("Phase 3C spike — SQLite+FTS5 prototype", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createSpikeDb();
    insertVerses(db, WEB_SAMPLE_VERSES);
  });

  // ── 1. Lookup eines Einzelverses ──────────────────────────────────────────
  it("looks up a single verse (John 3:16)", () => {
    const verse = lookupVerse(db, "WEB", "John 3:16");
    expect(verse?.text).toBe(
      "For God so loved the world, that he gave his only born Son, that whoever believes in him should not perish, but have eternal life."
    );
  });

  // ── 2. Lookup eines Versbereichs ──────────────────────────────────────────
  it("looks up a verse range (Romans 8:28-30) in ascending order, no gaps", () => {
    const verses = lookupRange(db, "WEB", "Romans 8:28-30");
    expect(verses.map((v) => v.verse)).toEqual([28, 29, 30]);
    expect(verses[0].text).toContain("We know that all things work together for good");
    expect(verses[2].text).toContain("also glorified");
  });

  // ── 3. Suche nach einem Wort ──────────────────────────────────────────────
  it("finds verses containing a single word via FTS5 (love)", () => {
    const hits = searchText(db, "WEB", "love");
    const refs = hits.map((h) => `${h.book} ${h.chapter}:${h.verse}`);
    // 1 Corinthians 13 ("the love chapter") must be found; single-word
    // match, so hits can include multiple verses/books.
    expect(refs).toContain("1 Corinthians 13:1");
    expect(hits.length).toBeGreaterThan(0);
  });

  // ── 4. Suche nach einer Wortgruppe ────────────────────────────────────────
  it("finds all verses containing an exact phrase via FTS5 (\"in the beginning\")", () => {
    const hits = searchText(db, "WEB", '"in the beginning"');
    const refs = hits.map((h) => `${h.book} ${h.chapter}:${h.verse}`).sort();
    // Genesis 1:1, John 1:1, and John 1:2 all genuinely contain this exact
    // phrase in the WEB sample text ("The same was in the beginning with
    // God." for 1:2) — phrase search correctly finds all three verses that
    // actually contain the adjacent phrase, not a superset based on the
    // individual words appearing anywhere in the verse.
    expect(refs).toEqual(["Genesis 1:1", "John 1:1", "John 1:2"]);
  });

  // ── 5. keine Treffer ─────────────────────────────────────────────────────
  it("returns zero results for a word that isn't in the sample corpus", () => {
    const hits = searchText(db, "WEB", "xenophobia");
    expect(hits).toEqual([]);
  });

  // ── 6. ungültige Referenz ─────────────────────────────────────────────────
  it("throws on an unrecognized book name, same as the rest of the project's reference logic", () => {
    expect(() => lookupVerse(db, "WEB", "Foobar 1:1")).toThrow(/Unknown book/);
  });

  it("returns undefined (not an error) for a well-formed reference to a verse not in the small sample", () => {
    // "John 1:10" is a real, valid reference — just outside our 1-5 sample.
    const verse = lookupVerse(db, "WEB", "John 1:10");
    expect(verse).toBeUndefined();
  });

  // ── 7. Psalmenüberschrift ─────────────────────────────────────────────────
  it("does not store the Psalm 23 superscription as verse 1 (English-tradition numbering)", () => {
    const verse1 = lookupVerse(db, "WEB", "Psalms 23:1");
    expect(verse1?.text).toBe("Yahweh is my shepherd; I shall lack nothing.");
    expect(verse1?.text.toLowerCase()).not.toContain("a psalm");
    expect(verse1?.text.toLowerCase()).not.toContain("david");
  });

  it("does not store the (longer) Psalm 51 superscription as verse 1 either", () => {
    const verse1 = lookupVerse(db, "WEB", "Psalms 51:1");
    expect(verse1?.text).toBe(
      "Have mercy on me, God, according to your loving kindness. According to the multitude of your tender mercies, blot out my transgressions."
    );
    expect(verse1?.text.toLowerCase()).not.toContain("nathan");
    expect(verse1?.text.toLowerCase()).not.toContain("bathsheba");
  });

  // ── 8. deutsche Referenz ──────────────────────────────────────────────────
  it("resolves a German book name with an ASCII-only name and colon separator (Johannes 3:16)", () => {
    const verse = lookupVerse(db, "WEB", "Johannes 3:16");
    expect(verse?.text).toBe(
      "For God so loved the world, that he gave his only born Son, that whoever believes in him should not perish, but have eternal life."
    );
  });

  it("DOCUMENTS a real parseReference limitation: German book names with umlauts are not recognized (Römer)", () => {
    // "Römer" (Romans) contains "ö" — reference-parser.ts's parseReference()
    // book-name regex character class is [A-Za-z\s], which does not include
    // non-ASCII letters. This is a genuine, pre-existing limitation
    // discovered by this spike, not something introduced here — see
    // docs/18_Phase3C_Verifikations_Spike.md "Offene Risiken".
    expect(() => parseReference("Römer 8:28")).toThrow();
  });

  it("DOCUMENTS a second real parseReference limitation: German comma chapter/verse separator is not supported", () => {
    // Conventional German notation uses a comma ("Römer 8,28"), not a colon.
    // parseReference()'s regex only accepts ':' before the verse number.
    // Even with an ASCII-only book name this fails.
    expect(() => parseReference("Romans 8,28")).toThrow();
  });

  // ── 9. englische Referenz ─────────────────────────────────────────────────
  it("resolves a standard English reference (Romans 8:28)", () => {
    const verse = lookupVerse(db, "WEB", "Romans 8:28");
    expect(verse?.text).toContain("We know that all things work together for good");
  });
});

describe("Phase 3C spike — versification comparison against versification.ts", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createSpikeDb();
    insertVerses(db, WEB_SAMPLE_VERSES);
  });

  it("Psalm 1 (complete chapter): stored verse count matches versification.ts exactly, no gaps/duplicates, ascending order", () => {
    const result = checkVersification(db, "WEB", "Psalms", 1);
    expect(result.expectedChapterLength).toBe(6);
    expect(result.isCompleteChapter).toBe(true);
    expect(result.matchesExpectedLength).toBe(true);
    expect(result.hasGaps).toBe(false);
    expect(result.hasDuplicates).toBe(false);
    expect(result.isAscending).toBe(true);
  });

  it("Psalm 23 (complete chapter): stored verse count matches versification.ts exactly, no gaps/duplicates, ascending order", () => {
    const result = checkVersification(db, "WEB", "Psalms", 23);
    expect(result.expectedChapterLength).toBe(6);
    expect(result.isCompleteChapter).toBe(true);
    expect(result.matchesExpectedLength).toBe(true);
    expect(result.hasGaps).toBe(false);
    expect(result.hasDuplicates).toBe(false);
    expect(result.isAscending).toBe(true);
  });

  it.each([
    ["Genesis", 1, 31],
    ["Psalms", 51, 19],
    ["John", 1, 51],
    ["John", 3, 36],
    ["Romans", 8, 39],
    ["1 Corinthians", 13, 13],
    ["Revelation", 22, 21],
  ])(
    "sampled range in %s %i: internally consistent (no gaps/dupes/reordering) and within the versification.ts chapter length of %i",
    (book, chapter, expectedLength) => {
      const result = checkVersification(db, "WEB", book as string, chapter as number);
      expect(result.expectedChapterLength).toBe(expectedLength);
      expect(result.hasDuplicates).toBe(false);
      expect(result.isAscending).toBe(true);
      expect(result.hasGaps).toBe(false); // internal-gap check for the sampled sub-range
      expect(Math.max(...result.storedVerses)).toBeLessThanOrEqual(expectedLength as number);
      expect(Math.min(...result.storedVerses)).toBeGreaterThanOrEqual(1);
    }
  );

  it("all 9 sampled references together cover 44 verses with zero duplicate (translation, book, chapter, verse) keys", () => {
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM verses`).get() as { n: number };
    expect(rows.n).toBe(44);
    expect(rows.n).toBe(WEB_SAMPLE_VERSES.length);
  });
});
