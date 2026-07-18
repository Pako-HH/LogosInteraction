import { describe, it, expect } from "vitest";
import { compareReferences } from "../src/services/reference-compare.js";

describe("compareReferences", () => {
  it("marks an identical reference as equal (and trivially subset/superset/intersects)", () => {
    const result = compareReferences("John 3:16", "John 3:16");
    expect(result).toEqual({
      equal: true,
      intersects: true,
      subset: true,
      superset: true,
      before: false,
      after: false,
    });
  });

  it("detects first-is-superset-of-second for a range containing a single verse", () => {
    // Regression fixpoint: corrects an earlier planning-doc note that
    // mislabeled this pairing as "subset" — 8:29 is contained *within*
    // 8:28-30, so from the first reference's perspective it is a superset.
    const result = compareReferences("Romans 8:28-30", "Romans 8:29");
    expect(result.superset).toBe(true);
    expect(result.subset).toBe(false);
    expect(result.equal).toBe(false);
    expect(result.intersects).toBe(true);
    expect(result.before).toBe(false);
    expect(result.after).toBe(false);
  });

  it("detects first-is-subset-of-second (mirror of the above)", () => {
    const result = compareReferences("Romans 8:29", "Romans 8:28-30");
    expect(result.subset).toBe(true);
    expect(result.superset).toBe(false);
  });

  it("detects overlapping ranges that are neither subset nor superset", () => {
    const result = compareReferences("Romans 8:28-29", "Romans 8:29-30");
    expect(result.intersects).toBe(true);
    expect(result.subset).toBe(false);
    expect(result.superset).toBe(false);
    expect(result.equal).toBe(false);
  });

  it("detects non-overlapping references within the same book as before/after", () => {
    const result = compareReferences("Genesis 1", "Genesis 2");
    expect(result.before).toBe(true);
    expect(result.after).toBe(false);
    expect(result.intersects).toBe(false);

    const reverse = compareReferences("Genesis 2", "Genesis 1");
    expect(reverse.after).toBe(true);
    expect(reverse.before).toBe(false);
  });

  it("orders references across books using canonical book order", () => {
    const result = compareReferences("Genesis 50", "Exodus 1");
    expect(result.before).toBe(true);
    expect(result.intersects).toBe(false);
  });

  it("orders references across testaments", () => {
    const result = compareReferences("Malachi 4", "Matthew 1");
    expect(result.before).toBe(true);
  });

  it("resolves a chapter-only reference to its full verse range via versification", () => {
    // Genesis 1 has exactly 31 verses (see data/versification.ts) — this
    // only passes if the versification lookup is wired in correctly.
    const exact = compareReferences("Genesis 1", "Genesis 1:1-31");
    expect(exact.equal).toBe(true);

    const containsLastVerse = compareReferences("Genesis 1", "Genesis 1:31");
    expect(containsLastVerse.superset).toBe(true);

    const doesNotContainNonexistentVerse = compareReferences("Genesis 1", "Genesis 1:32");
    expect(doesNotContainNonexistentVerse.intersects).toBe(false);
    expect(doesNotContainNonexistentVerse.before).toBe(true);
  });

  it("handles single-chapter books correctly", () => {
    // "Jude 4" means chapter 1, verse 4 (see reference-parser.ts).
    const result = compareReferences("Jude 4", "Jude 1:1-25");
    expect(result.subset).toBe(true);
  });

  it("handles cross-chapter ranges", () => {
    const result = compareReferences("Genesis 1:30-2:3", "Genesis 2:1");
    expect(result.superset).toBe(true);
  });

  it("propagates a parse error for an unrecognized reference", () => {
    expect(() => compareReferences("Not A Book 1:1", "John 3:16")).toThrow();
  });
});
