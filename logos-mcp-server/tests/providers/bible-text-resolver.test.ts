import { describe, it, expect, vi } from "vitest";
import { BibleTextResolver } from "../../src/services/providers/bible-text-resolver.js";
import type { BibleTextProvider } from "../../src/services/providers/bible-text-provider.js";

function fakeProvider(opts: {
  supports: (translation: string) => boolean;
  text?: string;
  rejects?: Error;
}): BibleTextProvider {
  return {
    supports: vi.fn(opts.supports),
    resolveText: vi.fn(async (passage: string, translation: string) => {
      if (opts.rejects) throw opts.rejects;
      return { passage, text: opts.text ?? "", bible: translation };
    }),
  };
}

describe("BibleTextResolver", () => {
  it("delegates to local when local supports the translation, never consulting biblia", async () => {
    const local = fakeProvider({ supports: (t) => t === "WEB", text: "local WEB text" });
    const biblia = fakeProvider({ supports: () => true, text: "biblia text" });
    const resolver = new BibleTextResolver(local, biblia);

    const result = await resolver.resolveText("John 3:16", "WEB");

    expect(result).toEqual({ passage: "John 3:16", text: "local WEB text", bible: "WEB" });
    expect(local.resolveText).toHaveBeenCalledExactlyOnceWith("John 3:16", "WEB");
    expect(biblia.resolveText).not.toHaveBeenCalled();
  });

  it("falls back to biblia when local does not support the translation (the real LEB case)", async () => {
    // Mirrors the real-world shape: LocalBibleTextProvider.supports() is
    // false for LEB (not gemeinfrei, never bundled — docs/15 Abschnitt 4),
    // BibliaBibleTextProvider.supports() is always true.
    const local = fakeProvider({ supports: (t) => t === "WEB" || t === "KJV" || t === "ASV" });
    const biblia = fakeProvider({ supports: () => true, text: "biblia LEB text" });
    const resolver = new BibleTextResolver(local, biblia);

    const result = await resolver.resolveText("Romans 8:28", "LEB");

    expect(result).toEqual({ passage: "Romans 8:28", text: "biblia LEB text", bible: "LEB" });
    expect(local.resolveText).not.toHaveBeenCalled();
    expect(biblia.resolveText).toHaveBeenCalledExactlyOnceWith("Romans 8:28", "LEB");
  });

  it("falls back to biblia when local is null (corpus unavailable, e.g. not yet built)", async () => {
    const biblia = fakeProvider({ supports: () => true, text: "biblia-only text" });
    const resolver = new BibleTextResolver(null, biblia);

    const result = await resolver.resolveText("John 3:16", "WEB");

    expect(result.text).toBe("biblia-only text");
    expect(biblia.resolveText).toHaveBeenCalledExactlyOnceWith("John 3:16", "WEB");
  });

  it("throws a clear error when neither local nor biblia can serve the translation", async () => {
    const resolver = new BibleTextResolver(null, null);
    await expect(resolver.resolveText("John 3:16", "WEB")).rejects.toThrow(
      /not available.*no local corpus coverage and no Biblia fallback configured/
    );
  });

  it("throws the same error when both are non-null but neither supports the translation", async () => {
    const local = fakeProvider({ supports: () => false });
    const biblia = fakeProvider({ supports: () => false });
    const resolver = new BibleTextResolver(local, biblia);
    await expect(resolver.resolveText("John 3:16", "XYZ")).rejects.toThrow(/not available/);
  });

  it("propagates a local provider's own error unchanged (e.g. verse not found)", async () => {
    const local = fakeProvider({ supports: () => true, rejects: new Error("No verses found for \"Genesis 1:99\"") });
    const biblia = fakeProvider({ supports: () => true, text: "should not be reached" });
    const resolver = new BibleTextResolver(local, biblia);

    await expect(resolver.resolveText("Genesis 1:99", "WEB")).rejects.toThrow(/No verses found/);
    // A local error is not a "not supported" signal — the resolver must not
    // silently retry against Biblia on a real local failure.
    expect(biblia.resolveText).not.toHaveBeenCalled();
  });

  it("propagates a biblia provider's own error unchanged (e.g. network/API failure)", async () => {
    const local = fakeProvider({ supports: () => false });
    const biblia = fakeProvider({ supports: () => true, rejects: new Error("Biblia API error 403: Access is denied.") });
    const resolver = new BibleTextResolver(local, biblia);

    await expect(resolver.resolveText("John 3:16", "LEB")).rejects.toThrow(/403/);
  });

  describe("supports()", () => {
    it("returns true if local supports the translation", () => {
      const local = fakeProvider({ supports: (t) => t === "WEB" });
      const resolver = new BibleTextResolver(local, null);
      expect(resolver.supports("WEB")).toBe(true);
    });

    it("returns true if biblia supports the translation and local does not", () => {
      const local = fakeProvider({ supports: () => false });
      const biblia = fakeProvider({ supports: () => true });
      const resolver = new BibleTextResolver(local, biblia);
      expect(resolver.supports("LEB")).toBe(true);
    });

    it("returns false when neither is available", () => {
      const resolver = new BibleTextResolver(null, null);
      expect(resolver.supports("WEB")).toBe(false);
    });

    it("returns false when both are present but neither supports the translation", () => {
      const local = fakeProvider({ supports: () => false });
      const biblia = fakeProvider({ supports: () => false });
      const resolver = new BibleTextResolver(local, biblia);
      expect(resolver.supports("XYZ")).toBe(false);
    });
  });
});
