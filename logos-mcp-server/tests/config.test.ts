import { describe, it, expect, afterEach, vi } from "vitest";

// Phase 4B: DEFAULT_BIBLE is now read from process.env at module-load time
// (see src/config.ts), so each case here resets the module cache and
// re-imports config.js fresh, after setting/clearing the env var — the
// same load-order pattern already used for LOCAL_BIBLE_CORPUS_PATH in
// tests/index.local-bible-resolver.integration.test.ts.
describe("config — DEFAULT_BIBLE", () => {
  const originalValue = process.env.DEFAULT_BIBLE;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.DEFAULT_BIBLE;
    } else {
      process.env.DEFAULT_BIBLE = originalValue;
    }
  });

  it("falls back to LEB when DEFAULT_BIBLE is not set", async () => {
    delete process.env.DEFAULT_BIBLE;
    vi.resetModules();
    const { DEFAULT_BIBLE } = await import("../src/config.js");
    expect(DEFAULT_BIBLE).toBe("LEB");
  });

  it("uses the override when DEFAULT_BIBLE is set", async () => {
    process.env.DEFAULT_BIBLE = "WEB";
    vi.resetModules();
    const { DEFAULT_BIBLE } = await import("../src/config.js");
    expect(DEFAULT_BIBLE).toBe("WEB");
  });

  it("falls back to LEB when DEFAULT_BIBLE is only whitespace", async () => {
    process.env.DEFAULT_BIBLE = "   ";
    vi.resetModules();
    const { DEFAULT_BIBLE } = await import("../src/config.js");
    expect(DEFAULT_BIBLE).toBe("LEB");
  });

  it("trims surrounding whitespace from a set value", async () => {
    process.env.DEFAULT_BIBLE = "  WEB  ";
    vi.resetModules();
    const { DEFAULT_BIBLE } = await import("../src/config.js");
    expect(DEFAULT_BIBLE).toBe("WEB");
  });
});
