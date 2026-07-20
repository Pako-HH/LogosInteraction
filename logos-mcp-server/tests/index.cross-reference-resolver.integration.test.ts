import { describe, it, expect, vi, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCorpusDb, insertCorpusVerses } from "../scripts/build-bible-corpus.js";
import { createCrossReferenceCorpusDb, insertCrossReferences } from "../scripts/build-cross-reference-corpus.js";

// Phase 4C-5 end-to-end proof: connects a real MCP Client to the real
// server built by createServer() (same pattern as
// tests/index.local-search-resolver.integration.test.ts) and verifies that
// get_cross_references now routes through the local-curated
// CrossReferenceResolver path (Phase 4C-2/4C-3/4C-4) when both the Bible
// text and cross-reference corpora cover the request, and falls back to the
// pre-existing heuristic path — with the new provenance note visible in the
// tool response either way — when they don't.
const getBibleTextMock = vi.fn();
const searchBibleMock = vi.fn();

vi.mock("../src/services/biblia-api.js", () => ({
  getBibleText: getBibleTextMock,
  searchBible: searchBibleMock,
}));

const testDir = mkdtempSync(join(tmpdir(), "logos-mcp-cross-reference-resolver-integration-"));

// Both corpus paths are read from process.env at src/config.ts's
// module-load time — must be set, and the files must already exist, before
// src/index.js is imported below (same load-order requirement documented in
// tests/index.local-bible-resolver.integration.test.ts).
const fixtureBibleCorpusPath = join(testDir, "fixture-bible-corpus.db");
process.env.LOCAL_BIBLE_CORPUS_PATH = fixtureBibleCorpusPath;
const bibleDb = createCorpusDb(fixtureBibleCorpusPath);
insertCorpusVerses(bibleDb, "WEB", [
  { book: "John", chapter: 3, verse: 16, text: "For God so loved the world, that he gave his only born Son." },
  { book: "Romans", chapter: 5, verse: 8, text: "But God commends his own love toward us, in that while we were yet sinners, Christ died for us." },
]);
bibleDb.close();

const fixtureCrossReferenceCorpusPath = join(testDir, "fixture-cross-reference-corpus.db");
process.env.LOCAL_CROSS_REFERENCE_CORPUS_PATH = fixtureCrossReferenceCorpusPath;
const crossRefDb = createCrossReferenceCorpusDb(fixtureCrossReferenceCorpusPath);
insertCrossReferences(crossRefDb, [
  {
    fromBook: "John", fromChapter: 3, fromVerse: 16,
    toBook: "Romans", toChapter: 5, toVerse: 8,
    toEndBook: "Romans", toEndChapter: 5, toEndVerse: 8,
    votes: 977,
  },
]);
crossRefDb.close();

const { createServer } = await import("../src/index.js");

afterAll(() => {
  delete process.env.LOCAL_BIBLE_CORPUS_PATH;
  delete process.env.LOCAL_CROSS_REFERENCE_CORPUS_PATH;
  rmSync(testDir, { recursive: true, force: true });
});

async function connectedClient() {
  const server = createServer();
  const client = new Client({ name: "phase-4c5-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

describe("get_cross_references — local-curated resolution via CrossReferenceResolver (Phase 4C-5)", () => {
  it("resolves a locally covered passage from the curated corpus, with provenance visible, without ever calling Biblia", async () => {
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "get_cross_references",
        arguments: { passage: "John 3:16", bible: "WEB" },
      });
      expect(result.isError).toBeFalsy();
      const responseText = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(responseText).toContain("**Romans 5:8**: But God commends his own love toward us");
      expect(responseText).toContain("_Source: local cross-reference corpus_");
      expect(getBibleTextMock).not.toHaveBeenCalled();
      expect(searchBibleMock).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("falls back to the heuristic path, with provenance visible, for a passage the curated corpus doesn't cover", async () => {
    searchBibleMock.mockResolvedValue({
      query: "kind patient",
      resultCount: 1,
      results: [{ title: "1 Corinthians 13:4", preview: "Love is patient and is kind." }],
    });
    const { client, server } = await connectedClient();
    try {
      // No `bible` argument: resolves to DEFAULT_BIBLE ("LEB", not
      // overridden in this test file), which neither fixture corpus
      // covers — so the heuristic fallback's search genuinely reaches the
      // mocked Biblia search, not the local search index.
      const result = await client.callTool({
        name: "get_cross_references",
        arguments: { passage: "Romans 5:8", key_terms: "kind patient" },
      });
      expect(result.isError).toBeFalsy();
      const responseText = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(responseText).toContain("**1 Corinthians 13:4**: Love is patient and is kind.");
      expect(responseText).toContain("_Source: heuristic keyword search_");
    } finally {
      await client.close();
      await server.close();
      searchBibleMock.mockReset();
    }
  });
});
