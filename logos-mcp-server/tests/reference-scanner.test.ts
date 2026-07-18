import { describe, it, expect } from "vitest";
import { scanReferencesLocal } from "../src/services/reference-scanner.js";

describe("scanReferencesLocal", () => {
  it("finds a single English reference", () => {
    const results = scanReferencesLocal("See John 3:16 for more.");
    expect(results).toEqual([{ passage: "John 3:16" }]);
  });

  it("finds multiple English references in a paragraph", () => {
    const results = scanReferencesLocal(
      "As it says in Romans 8:28, and also compare Genesis 1:1 with John 3:16."
    );
    expect(results.map((r) => r.passage)).toEqual(["Romans 8:28", "Genesis 1:1", "John 3:16"]);
  });

  it("finds German references using full German book names and comma separator (regression fixpoint)", () => {
    // This is the exact text from the earlier Biblia-backed live test in
    // docs/08_Testprotokoll.md, which the pre-migration English-only parser
    // could not have handled locally.
    const results = scanReferencesLocal("Siehe Johannes 3,16 und Römer 8,28.");
    expect(results.map((r) => r.passage)).toEqual(["John 3:16", "Romans 8:28"]);
  });

  it("finds German numbered books, with and without the ordinal period", () => {
    const withPeriod = scanReferencesLocal("Vgl. 1. Mose 1,1 und 1. Korinther 13,4.");
    expect(withPeriod.map((r) => r.passage)).toEqual(["Genesis 1:1", "1 Corinthians 13:4"]);

    const withoutPeriod = scanReferencesLocal("Vgl. 1 Mose 1,1.");
    expect(withoutPeriod.map((r) => r.passage)).toEqual(["Genesis 1:1"]);
  });

  it("distinguishes John's Gospel from 1 John in German", () => {
    const gospel = scanReferencesLocal("Johannes 3,16");
    expect(gospel.map((r) => r.passage)).toEqual(["John 3:16"]);

    const epistle = scanReferencesLocal("1. Johannes 3,16");
    expect(epistle.map((r) => r.passage)).toEqual(["1 John 3:16"]);
  });

  it("handles a verse range", () => {
    const results = scanReferencesLocal("Read Romans 8:28-30 carefully.");
    expect(results).toEqual([{ passage: "Romans 8:28-30" }]);
  });

  it("returns an empty array for text with no Bible references", () => {
    expect(scanReferencesLocal("This paragraph has no references at all.")).toEqual([]);
  });

  it("does not treat an unrelated word followed by a number as a reference", () => {
    // "Jahr" ("year") is not a recognized book token, so this must not match.
    expect(scanReferencesLocal("Das geschah im Jahr 1994.")).toEqual([]);
  });

  it("does not match a plain number with no preceding book name", () => {
    expect(scanReferencesLocal("There were 1994 people at the event.")).toEqual([]);
  });

  describe("tag_chapters option", () => {
    it("includes chapter-only references when tagChapters is true (default)", () => {
      const results = scanReferencesLocal("See Genesis 1 for the creation account.");
      expect(results).toEqual([{ passage: "Genesis 1" }]);
    });

    it("excludes chapter-only references when tagChapters is false", () => {
      const results = scanReferencesLocal("See Genesis 1 for the creation account.", false);
      expect(results).toEqual([]);
    });

    it("still includes verse-level references when tagChapters is false", () => {
      const results = scanReferencesLocal("See Genesis 1:1 for the creation account.", false);
      expect(results).toEqual([{ passage: "Genesis 1:1" }]);
    });
  });

  describe("plausibility filtering (versification-based)", () => {
    it("rejects a chapter number beyond the book's actual length", () => {
      // Genesis has 50 chapters.
      expect(scanReferencesLocal("Genesis 500")).toEqual([]);
    });

    it("rejects a verse number beyond the chapter's actual length", () => {
      // John 3 has 36 verses.
      expect(scanReferencesLocal("John 3:99")).toEqual([]);
    });

    it("accepts a chapter/verse at the exact upper bound", () => {
      expect(scanReferencesLocal("John 3:36")).toEqual([{ passage: "John 3:36" }]);
    });
  });

  it("is case-insensitive for book names", () => {
    const results = scanReferencesLocal("see romans 8:28 and JOHN 3:16");
    expect(results.map((r) => r.passage)).toEqual(["Romans 8:28", "John 3:16"]);
  });

  it("handles mixed English and German references in the same text", () => {
    const results = scanReferencesLocal("Compare John 3:16 with Römer 8,28.");
    expect(results.map((r) => r.passage)).toEqual(["John 3:16", "Romans 8:28"]);
  });
});
