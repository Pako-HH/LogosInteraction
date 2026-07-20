import { describe, it, expect, vi } from "vitest";
import { CrossReferenceResolver } from "../../src/services/providers/cross-reference-resolver.js";
import type { CrossReferenceProvider, CrossReferenceResult } from "../../src/services/providers/cross-reference-provider.js";

function fakeProvider(opts: {
  results?: CrossReferenceResult["results"];
  rejects?: Error;
}): CrossReferenceProvider {
  return {
    findCrossReferences: vi.fn(async (passage: string) => {
      if (opts.rejects) throw opts.rejects;
      return { passage, results: opts.results ?? [] };
    }),
  };
}

describe("CrossReferenceResolver", () => {
  it("returns the local result tagged as local-curated when local has results", async () => {
    const local = fakeProvider({ results: [{ title: "Romans 5:8", preview: "local curated preview" }] });
    const heuristic = fakeProvider({ results: [{ title: "should not be used", preview: "..." }] });
    const resolver = new CrossReferenceResolver(local, heuristic);

    const result = await resolver.findCrossReferences("John 3:16");

    expect(result).toEqual({
      passage: "John 3:16",
      results: [{ title: "Romans 5:8", preview: "local curated preview" }],
      source: "local-curated",
    });
    expect(local.findCrossReferences).toHaveBeenCalledExactlyOnceWith("John 3:16", undefined, undefined);
    expect(heuristic.findCrossReferences).not.toHaveBeenCalled();
  });

  it("falls back to heuristic, tagged as heuristic, when local returns zero results (valid passage, no curated cross-references)", async () => {
    const local = fakeProvider({ results: [] });
    const heuristic = fakeProvider({ results: [{ title: "Ephesians 2:8", preview: "heuristic hit" }] });
    const resolver = new CrossReferenceResolver(local, heuristic);

    const result = await resolver.findCrossReferences("3 John 1:1");

    expect(result).toEqual({
      passage: "3 John 1:1",
      results: [{ title: "Ephesians 2:8", preview: "heuristic hit" }],
      source: "heuristic",
    });
  });

  it("falls back to heuristic, tagged as heuristic, when local throws (e.g. whole-chapter passage or unsupported translation)", async () => {
    const local = fakeProvider({ rejects: new Error("Cross-references require a specific verse") });
    const heuristic = fakeProvider({ results: [{ title: "Genesis 1:2", preview: "heuristic hit" }] });
    const resolver = new CrossReferenceResolver(local, heuristic);

    const result = await resolver.findCrossReferences("Genesis 1");

    expect(result.source).toBe("heuristic");
    expect(result.results).toEqual([{ title: "Genesis 1:2", preview: "heuristic hit" }]);
  });

  it("falls back to heuristic, tagged as heuristic, when local is null (corpus unavailable, e.g. not yet built)", async () => {
    const heuristic = fakeProvider({ results: [{ title: "Ephesians 2:8", preview: "heuristic-only" }] });
    const resolver = new CrossReferenceResolver(null, heuristic);

    const result = await resolver.findCrossReferences("John 3:16");

    expect(result.source).toBe("heuristic");
    expect(result.results[0].preview).toBe("heuristic-only");
  });

  it("returns an empty, heuristic-tagged result when both local and heuristic find nothing", async () => {
    const local = fakeProvider({ results: [] });
    const heuristic = fakeProvider({ results: [] });
    const resolver = new CrossReferenceResolver(local, heuristic);

    const result = await resolver.findCrossReferences("Obadiah 1:1");

    expect(result).toEqual({ passage: "Obadiah 1:1", results: [], source: "heuristic" });
  });

  it("propagates the heuristic provider's own error unchanged when it is the last resort and fails", async () => {
    const local = fakeProvider({ results: [] });
    const heuristic = fakeProvider({ rejects: new Error("Cannot parse reference: \"not a reference\"") });
    const resolver = new CrossReferenceResolver(local, heuristic);

    await expect(resolver.findCrossReferences("not a reference")).rejects.toThrow(/Cannot parse reference/);
  });

  it("passes key_terms and bible through to both local and (on fallback) heuristic", async () => {
    const local = fakeProvider({ results: [] });
    const heuristic = fakeProvider({ results: [{ title: "hit", preview: "..." }] });
    const resolver = new CrossReferenceResolver(local, heuristic);

    await resolver.findCrossReferences("Romans 8:28", "grace faith", "WEB");

    expect(local.findCrossReferences).toHaveBeenCalledExactlyOnceWith("Romans 8:28", "grace faith", "WEB");
    expect(heuristic.findCrossReferences).toHaveBeenCalledExactlyOnceWith("Romans 8:28", "grace faith", "WEB");
  });
});
