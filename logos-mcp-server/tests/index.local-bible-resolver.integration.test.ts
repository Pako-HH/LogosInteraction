import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCorpusDb, insertCorpusVerses } from "../scripts/build-bible-corpus.js";

// Phase 3D-5 end-to-end proof: connects a real MCP Client to the real
// server built by createServer() (same as tests/index.integration.test.ts)
// and verifies that WEB/KJV/ASV requests are answered from a *local*
// fixture corpus — biblia-api.ts is mocked and must NEVER be called for
// these three translations — while a translation the local corpus doesn't
// cover (LEB) still falls back to it, exactly as before Phase 3D-5.
const getBibleTextMock = vi.fn();
const searchBibleMock = vi.fn();

vi.mock("../src/services/biblia-api.js", () => ({
  getBibleText: getBibleTextMock,
  searchBible: searchBibleMock,
}));

const testDir = mkdtempSync(join(tmpdir(), "logos-mcp-local-resolver-integration-"));
const fixtureCorpusPath = join(testDir, "fixture-corpus.db");

// LOCAL_BIBLE_CORPUS_PATH is read from process.env at src/config.ts's
// module-load time — must be set, and the file must already exist on disk,
// before src/index.js (which transitively imports config.js and
// constructs LocalBibleTextProvider inside createServer()) is imported
// below. Module-level code in this file runs before any test/hook, so
// building the fixture here (not in beforeAll) guarantees the right order.
process.env.LOCAL_BIBLE_CORPUS_PATH = fixtureCorpusPath;

const fixtureDb = createCorpusDb(fixtureCorpusPath);
insertCorpusVerses(fixtureDb, "WEB", [
  { book: "John", chapter: 3, verse: 16, text: "For God so loved the world, that he gave his only born Son..." },
]);
insertCorpusVerses(fixtureDb, "KJV", [
  { book: "Romans", chapter: 8, verse: 28, text: "And we know that all things work together for good..." },
]);
insertCorpusVerses(fixtureDb, "ASV", [
  { book: "Psalms", chapter: 117, verse: 1, text: "O praise Jehovah, all ye nations." },
]);
fixtureDb.close();

const { createServer } = await import("../src/index.js");

afterAll(() => {
  delete process.env.LOCAL_BIBLE_CORPUS_PATH;
  rmSync(testDir, { recursive: true, force: true });
});

async function connectedClient() {
  const server = createServer();
  const client = new Client({ name: "phase-3d5-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

describe("get_bible_text — local-first resolution via BibleTextResolver (Phase 3D-5)", () => {
  afterEach(() => {
    getBibleTextMock.mockReset();
    searchBibleMock.mockReset();
  });

  it("resolves WEB from the local corpus without ever calling biblia-api.ts", async () => {
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "get_bible_text",
        arguments: { passage: "John 3:16", bible: "WEB" },
      });
      expect(result.content).toEqual([
        {
          type: "text",
          text: "**John 3:16** (WEB)\n\nFor God so loved the world, that he gave his only born Son...",
        },
      ]);
      expect(result.isError).toBeFalsy();
      expect(getBibleTextMock).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("resolves KJV from the local corpus without ever calling biblia-api.ts", async () => {
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "get_bible_text",
        arguments: { passage: "Romans 8:28", bible: "KJV" },
      });
      expect(result.content).toEqual([
        {
          type: "text",
          text: "**Romans 8:28** (KJV)\n\nAnd we know that all things work together for good...",
        },
      ]);
      expect(getBibleTextMock).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("resolves ASV from the local corpus without ever calling biblia-api.ts", async () => {
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "get_bible_text",
        arguments: { passage: "Psalms 117:1", bible: "ASV" },
      });
      expect(result.content).toEqual([
        { type: "text", text: "**Psalms 117:1** (ASV)\n\nO praise Jehovah, all ye nations." },
      ]);
      expect(getBibleTextMock).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("still falls back to (mocked) Biblia for LEB, which the local corpus never covers", async () => {
    getBibleTextMock.mockResolvedValue({
      passage: "John 3:16",
      text: "Biblia-sourced LEB text.",
      bible: "LEB",
    });
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "get_bible_text",
        arguments: { passage: "John 3:16", bible: "LEB" },
      });
      expect(result.content).toEqual([
        { type: "text", text: "**John 3:16** (LEB)\n\nBiblia-sourced LEB text." },
      ]);
      expect(getBibleTextMock).toHaveBeenCalledExactlyOnceWith("John 3:16", "LEB");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("get_passage_context also resolves locally for WEB (shares the same bibleTextProvider)", async () => {
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "get_passage_context",
        arguments: { passage: "John 3:16", bible: "WEB", context_verses: 0 },
      });
      expect(result.isError).toBeFalsy();
      expect(getBibleTextMock).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });
});
