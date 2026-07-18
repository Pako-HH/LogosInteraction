import { describe, it, expect, vi } from "vitest";

const getBibleTextMock = vi.fn();

vi.mock("../../src/services/biblia-api.js", () => ({
  getBibleText: getBibleTextMock,
}));

const { BibliaBibleTextProvider } = await import(
  "../../src/services/providers/biblia-bible-text-provider.js"
);

describe("BibliaBibleTextProvider", () => {
  it("supports() always returns true (Biblia formally covers all 6 known codes)", () => {
    const provider = new BibliaBibleTextProvider();
    expect(provider.supports("LEB")).toBe(true);
    expect(provider.supports("SomeUnknownCode")).toBe(true);
  });

  it("delegates resolveText() straight through to biblia-api.ts getBibleText(), args and result unchanged", async () => {
    getBibleTextMock.mockReset();
    const fakeResult = { passage: "John 3:16", text: "For God so loved...", bible: "WEB" };
    getBibleTextMock.mockResolvedValue(fakeResult);

    const provider = new BibliaBibleTextProvider();
    const result = await provider.resolveText("John 3:16", "WEB");

    expect(getBibleTextMock).toHaveBeenCalledExactlyOnceWith("John 3:16", "WEB");
    expect(result).toEqual(fakeResult);
  });

  it("propagates rejections from getBibleText() unchanged", async () => {
    getBibleTextMock.mockReset();
    getBibleTextMock.mockRejectedValue(new Error("Biblia API error 403: Access is denied."));

    const provider = new BibliaBibleTextProvider();
    await expect(provider.resolveText("John 3:16", "LEB")).rejects.toThrow(
      "Biblia API error 403: Access is denied."
    );
  });
});
