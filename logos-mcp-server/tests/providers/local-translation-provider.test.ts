import { describe, it, expect, vi } from "vitest";

const getInstalledBiblesMock = vi.fn();

vi.mock("../../src/services/catalog-reader.js", () => ({
  getInstalledBibles: getInstalledBiblesMock,
}));

const { LocalTranslationProvider } = await import(
  "../../src/services/providers/local-translation-provider.js"
);

describe("LocalTranslationProvider", () => {
  it("delegates listAvailable() straight through to catalog-reader.ts getInstalledBibles(), args and result unchanged", async () => {
    getInstalledBiblesMock.mockReset();
    const fakeBibles = [
      {
        resourceId: "LLS:LEB",
        title: "The Lexham English Bible",
        abbreviatedTitle: "LEB",
        languages: ["en"],
        publishers: ["Lexham Press"],
      },
    ];
    getInstalledBiblesMock.mockReturnValue(fakeBibles);

    const provider = new LocalTranslationProvider();
    const result = await provider.listAvailable("Lexham");

    expect(getInstalledBiblesMock).toHaveBeenCalledExactlyOnceWith("Lexham");
    expect(result).toEqual(fakeBibles);
  });

  it("passes query through as undefined when omitted", async () => {
    getInstalledBiblesMock.mockReset();
    getInstalledBiblesMock.mockReturnValue([]);

    const provider = new LocalTranslationProvider();
    await provider.listAvailable();

    expect(getInstalledBiblesMock).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("propagates the underlying error message unchanged (e.g. catalog not found)", async () => {
    getInstalledBiblesMock.mockReset();
    getInstalledBiblesMock.mockImplementation(() => {
      throw new Error("Logos library catalog was not found.");
    });

    const provider = new LocalTranslationProvider();
    await expect(provider.listAvailable()).rejects.toThrow("Logos library catalog was not found.");
  });
});
