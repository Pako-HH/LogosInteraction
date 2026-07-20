import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCorpusDb, insertCorpusVerses } from "../scripts/build-bible-corpus.js";

// Phase 3D-6 end-to-end proof, same pattern as
// tests/index.local-bible-resolver.integration.test.ts (Phase 3D-5):
// connects a real MCP Client to the real server built by createServer()
// and verifies that search_bible for WEB is answered from a *local*
// fixture corpus — biblia-api.ts is mocked and must NEVER be called for
// it — while a translation the local corpus doesn't cover (LEB, the
// default) still falls back to it, exactly as before this phase.
const getBibleTextMock = vi.fn();
const searchBibleMock = vi.fn();

vi.mock("../src/services/biblia-api.js", () => ({
  getBibleText: getBibleTextMock,
  searchBible: searchBibleMock,
}));

const testDir = mkdtempSync(join(tmpdir(), "logos-mcp-local-search-resolver-integration-"));
const fixtureCorpusPath = join(testDir, "fixture-corpus.db");

// Must be set, and the file must already exist, before src/index.js
// (which transitively imports config.js and constructs LocalSearchProvider
// inside createServer()) is imported below — see docs/22/docs/23 for the
// module-load-time ordering rationale.
process.env.LOCAL_BIBLE_CORPUS_PATH = fixtureCorpusPath;

const fixtureDb = createCorpusDb(fixtureCorpusPath);
insertCorpusVerses(fixtureDb, "WEB", [
  { book: "John", chapter: 3, verse: 16, text: "For God so loved the world, that he gave his only born Son." },
  { book: "Romans", chapter: 8, verse: 28, text: "We know that all things work together for good for those who love God." },
  { book: "1 Corinthians", chapter: 13, verse: 4, text: "Love is patient and is kind." },
]);
fixtureDb.close();

const { createServer } = await import("../src/index.js");

afterAll(() => {
  delete process.env.LOCAL_BIBLE_CORPUS_PATH;
  rmSync(testDir, { recursive: true, force: true });
});

async function connectedClient() {
  const server = createServer();
  const client = new Client({ name: "phase-3d6-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

describe("search_bible — local-first resolution via SearchResolver (Phase 3D-6)", () => {
  afterEach(() => {
    getBibleTextMock.mockReset();
    searchBibleMock.mockReset();
  });

  it("resolves a word search for WEB from the local corpus without ever calling biblia-api.ts", async () => {
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "search_bible",
        arguments: { query: "love", bible: "WEB" },
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Found 2 results");
      expect(text).toContain("Romans 8:28");
      expect(text).toContain("1 Corinthians 13:4");
      expect(searchBibleMock).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("resolves a phrase search for WEB locally, matching the existing markdown format exactly", async () => {
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "search_bible",
        arguments: { query: "God so loved", bible: "WEB" },
      });
      // Byte-identical to the format string already used for the
      // Biblia-backed path before this phase:
      // `Found ${resultCount} results for "${query}":\n\n${lines.join("\n\n")}`
      expect(result.content).toEqual([
        {
          type: "text",
          text: 'Found 1 results for "God so loved":\n\n**John 3:16**: For God so loved the world, that he gave his only born Son.',
        },
      ]);
      expect(searchBibleMock).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("reports zero results locally without calling biblia-api.ts", async () => {
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "search_bible",
        arguments: { query: "xenophobia", bible: "WEB" },
      });
      expect(result.content).toEqual([{ type: "text", text: 'No results for "xenophobia".' }]);
      expect(searchBibleMock).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("still falls back to (mocked) Biblia for LEB (the default), which the local corpus never covers", async () => {
    searchBibleMock.mockResolvedValue({
      query: "love",
      resultCount: 1,
      results: [{ title: "Some LEB Verse", preview: "Biblia-sourced preview." }],
    });
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "search_bible",
        arguments: { query: "love" }, // no bible -> DEFAULT_BIBLE (LEB)
      });
      expect(result.content).toEqual([
        { type: "text", text: 'Found 1 results for "love":\n\n**Some LEB Verse**: Biblia-sourced preview.' },
      ]);
      expect(searchBibleMock).toHaveBeenCalledExactlyOnceWith("love", { limit: undefined, bible: undefined });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("get_cross_references without an explicit bible now returns the local-curated corpus with placeholder previews (Phase 4C bugfix)", async () => {
    // This file doesn't override LOCAL_CROSS_REFERENCE_CORPUS_PATH, so
    // get_cross_references reaches the real, on-disk production corpus,
    // which has real curated entries for Romans 8:28. DEFAULT_BIBLE ("LEB")
    // is not covered by this file's fixture Bible-text corpus (only WEB was
    // inserted, see top of file), so every preview-text lookup for those
    // hits falls through to the (here unconfigured) Biblia mock and fails.
    //
    // Before the Phase 4C bugfix (local-cross-reference-provider.ts), that
    // per-row failure discarded the entire local result set and this test
    // asserted the resulting fallback to heuristic/Biblia search as
    // "unchanged" behavior. That fallback was itself the bug: real local
    // curated data was being thrown away. Now the local hits survive with a
    // placeholder preview, and Biblia's search endpoint is correctly never
    // consulted at all.
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "get_cross_references",
        arguments: { passage: "Romans 8:28", key_terms: "grace faith" },
      });
      expect(result.isError).toBeFalsy();
      const responseText = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(responseText).toContain("_Source: local cross-reference corpus_");
      expect(searchBibleMock).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("get_cross_references WITH an explicit local bible now resolves entirely locally (Phase 3 close-out)", async () => {
    // Closes the gap documented in docs/22/docs/23: previously
    // get_cross_references could never reach the local corpus regardless
    // of translation. With an explicit bible: "WEB", both the internal
    // text lookup (for keyword extraction) and the search call now route
    // through the local corpus — biblia-api.ts must never be called.
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "get_cross_references",
        arguments: { passage: "John 3:16", key_terms: "loved world", bible: "WEB" },
      });
      expect(result.isError).toBeFalsy();
      expect(getBibleTextMock).not.toHaveBeenCalled();
      expect(searchBibleMock).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });
});
