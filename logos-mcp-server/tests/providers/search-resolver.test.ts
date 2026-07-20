import { describe, it, expect, vi } from "vitest";
import { SearchResolver } from "../../src/services/providers/search-resolver.js";
import type { SearchProvider, SearchOptions } from "../../src/services/providers/search-provider.js";

function fakeProvider(opts: {
  supports: (translation: string) => boolean;
  results?: Array<{ title: string; preview: string }>;
  rejects?: Error;
}): SearchProvider {
  return {
    supports: vi.fn(opts.supports),
    search: vi.fn(async (query: string, options?: SearchOptions) => {
      if (opts.rejects) throw opts.rejects;
      const results = opts.results ?? [];
      return { query, resultCount: results.length, results };
    }),
  };
}

describe("SearchResolver", () => {
  it("delegates to local when local supports the resolved translation, never consulting biblia", async () => {
    const local = fakeProvider({ supports: (t) => t === "WEB", results: [{ title: "John 3:16", preview: "local hit" }] });
    const biblia = fakeProvider({ supports: () => true, results: [{ title: "x", preview: "biblia hit" }] });
    const resolver = new SearchResolver(local, biblia);

    const result = await resolver.search("love", { bible: "WEB" });

    expect(result.results).toEqual([{ title: "John 3:16", preview: "local hit" }]);
    expect(local.search).toHaveBeenCalledExactlyOnceWith("love", { bible: "WEB" });
    expect(biblia.search).not.toHaveBeenCalled();
  });

  it("resolves a missing bible option to DEFAULT_BIBLE before deciding local vs. biblia", async () => {
    const local = fakeProvider({ supports: (t) => t === "WEB" });
    const biblia = fakeProvider({ supports: () => true, results: [{ title: "x", preview: "biblia default hit" }] });
    const resolver = new SearchResolver(local, biblia);

    // No `bible` in options at all — mirrors search_bible's handler, which
    // does not pre-resolve DEFAULT_BIBLE itself (see docs/23).
    const result = await resolver.search("grace");

    expect(result.results).toEqual([{ title: "x", preview: "biblia default hit" }]);
    expect(local.search).not.toHaveBeenCalled();
    expect(biblia.search).toHaveBeenCalledExactlyOnceWith("grace", undefined);
  });

  it("falls back to biblia when local does not support the resolved translation (the real LEB case)", async () => {
    const local = fakeProvider({ supports: (t) => t === "WEB" || t === "KJV" || t === "ASV" });
    const biblia = fakeProvider({ supports: () => true, results: [{ title: "x", preview: "biblia LEB hit" }] });
    const resolver = new SearchResolver(local, biblia);

    const result = await resolver.search("faith", { bible: "LEB" });

    expect(result.results).toEqual([{ title: "x", preview: "biblia LEB hit" }]);
    expect(local.search).not.toHaveBeenCalled();
    expect(biblia.search).toHaveBeenCalledExactlyOnceWith("faith", { bible: "LEB" });
  });

  it("falls back to biblia when local is null (corpus unavailable)", async () => {
    const biblia = fakeProvider({ supports: () => true, results: [{ title: "x", preview: "biblia-only hit" }] });
    const resolver = new SearchResolver(null, biblia);

    const result = await resolver.search("love", { bible: "WEB" });

    expect(result.results).toEqual([{ title: "x", preview: "biblia-only hit" }]);
  });

  it("throws a clear error when neither local nor biblia can serve the translation", async () => {
    const resolver = new SearchResolver(null, null);
    await expect(resolver.search("love", { bible: "WEB" })).rejects.toThrow(
      /not available.*no local corpus coverage and no Biblia fallback configured/
    );
  });

  it("propagates a local provider's own error unchanged, without silently retrying against biblia", async () => {
    const local = fakeProvider({ supports: () => true, rejects: new Error("Local search query failed for \"???\"") });
    const biblia = fakeProvider({ supports: () => true, results: [{ title: "x", preview: "should not be reached" }] });
    const resolver = new SearchResolver(local, biblia);

    await expect(resolver.search("???", { bible: "WEB" })).rejects.toThrow(/Local search query failed/);
    expect(biblia.search).not.toHaveBeenCalled();
  });

  it("propagates a biblia provider's own error unchanged", async () => {
    const local = fakeProvider({ supports: () => false });
    const biblia = fakeProvider({ supports: () => true, rejects: new Error("Biblia API error 403: Access is denied.") });
    const resolver = new SearchResolver(local, biblia);

    await expect(resolver.search("love", { bible: "LEB" })).rejects.toThrow(/403/);
  });

  describe("supports()", () => {
    it("returns true if local supports the translation", () => {
      const local = fakeProvider({ supports: (t) => t === "WEB" });
      const resolver = new SearchResolver(local, null);
      expect(resolver.supports("WEB")).toBe(true);
    });

    it("returns true if biblia supports the translation and local does not", () => {
      const local = fakeProvider({ supports: () => false });
      const biblia = fakeProvider({ supports: () => true });
      const resolver = new SearchResolver(local, biblia);
      expect(resolver.supports("LEB")).toBe(true);
    });

    it("returns false when neither is available", () => {
      const resolver = new SearchResolver(null, null);
      expect(resolver.supports("WEB")).toBe(false);
    });
  });
});
