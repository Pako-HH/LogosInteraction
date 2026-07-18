import { describe, it, expect, vi } from "vitest";

const searchBibleMock = vi.fn();

vi.mock("../../src/services/biblia-api.js", () => ({
  searchBible: searchBibleMock,
}));

const { BibliaSearchProvider } = await import(
  "../../src/services/providers/biblia-search-provider.js"
);

describe("BibliaSearchProvider", () => {
  it("supports() always returns true (Biblia formally covers all 6 known codes)", () => {
    const provider = new BibliaSearchProvider();
    expect(provider.supports("WEB")).toBe(true);
    expect(provider.supports("SomeUnknownCode")).toBe(true);
  });

  it("delegates search() straight through to biblia-api.ts searchBible(), args and result unchanged", async () => {
    searchBibleMock.mockReset();
    const fakeResult = {
      query: "grace",
      resultCount: 2,
      results: [
        { title: "Romans 8:28", preview: "..." },
        { title: "Ephesians 2:8", preview: "..." },
      ],
    };
    searchBibleMock.mockResolvedValue(fakeResult);

    const provider = new BibliaSearchProvider();
    const result = await provider.search("grace", { limit: 15, bible: "LEB" });

    expect(searchBibleMock).toHaveBeenCalledExactlyOnceWith("grace", { limit: 15, bible: "LEB" });
    expect(result).toEqual(fakeResult);
  });

  it("defaults options to {} when omitted, matching searchBible()'s own default parameter", async () => {
    searchBibleMock.mockReset();
    searchBibleMock.mockResolvedValue({ query: "faith", resultCount: 0, results: [] });

    const provider = new BibliaSearchProvider();
    await provider.search("faith");

    expect(searchBibleMock).toHaveBeenCalledExactlyOnceWith("faith", {});
  });

  it("propagates rejections from searchBible() unchanged", async () => {
    searchBibleMock.mockReset();
    searchBibleMock.mockRejectedValue(new Error("Biblia API error 403: Access is denied."));

    const provider = new BibliaSearchProvider();
    await expect(provider.search("grace")).rejects.toThrow("Biblia API error 403: Access is denied.");
  });
});
