import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCorpusDb, insertCorpusVerses } from "../scripts/build-bible-corpus.js";

// Phase 4B.2 end-to-end proof: DEFAULT_BIBLE (made overridable in Phase 4B.1,
// see src/config.ts) is read at module-load time, exactly like
// LOCAL_BIBLE_CORPUS_PATH already is (Phase 3D-5/3D-6). So each scenario
// below resets the module registry and re-imports src/index.js fresh after
// setting/clearing DEFAULT_BIBLE — same load-order requirement already
// exercised in isolation for config.js alone by tests/config.test.ts, now
// proven through the real MCP protocol (Client + InMemoryTransport,
// createServer()). biblia-api.ts stays mocked throughout: it must still be
// called when DEFAULT_BIBLE is unset (unchanged LEB fallback), and must
// never be called when DEFAULT_BIBLE=WEB is set and a tool call omits its
// own `bible` argument.
const getBibleTextMock = vi.fn();
const searchBibleMock = vi.fn();

vi.mock("../src/services/biblia-api.js", () => ({
  getBibleText: getBibleTextMock,
  searchBible: searchBibleMock,
}));

const testDir = mkdtempSync(join(tmpdir(), "logos-mcp-default-bible-override-integration-"));
const fixtureCorpusPath = join(testDir, "fixture-corpus.db");
process.env.LOCAL_BIBLE_CORPUS_PATH = fixtureCorpusPath;

const fixtureDb = createCorpusDb(fixtureCorpusPath);
insertCorpusVerses(fixtureDb, "WEB", [
  { book: "John", chapter: 3, verse: 16, text: "For God so loved the world, that he gave his only born Son." },
]);
fixtureDb.close();

afterAll(() => {
  delete process.env.LOCAL_BIBLE_CORPUS_PATH;
  delete process.env.DEFAULT_BIBLE;
  rmSync(testDir, { recursive: true, force: true });
});

async function connectedClient() {
  vi.resetModules();
  const { createServer } = await import("../src/index.js");
  const server = createServer();
  const client = new Client({ name: "phase-4b2-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

describe("DEFAULT_BIBLE override — end-to-end via the real MCP client (Phase 4B.2)", () => {
  afterEach(() => {
    getBibleTextMock.mockReset();
    searchBibleMock.mockReset();
    delete process.env.DEFAULT_BIBLE;
  });

  it("get_bible_text without a bible argument still falls back to (mocked) Biblia for LEB when DEFAULT_BIBLE is unset", async () => {
    delete process.env.DEFAULT_BIBLE;
    getBibleTextMock.mockResolvedValue({
      passage: "John 3:16",
      text: "Biblia-sourced LEB text.",
      bible: "LEB",
    });
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "get_bible_text",
        arguments: { passage: "John 3:16" },
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

  it("get_bible_text without a bible argument resolves locally when DEFAULT_BIBLE=WEB is set, without ever calling Biblia", async () => {
    process.env.DEFAULT_BIBLE = "WEB";
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "get_bible_text",
        arguments: { passage: "John 3:16" },
      });
      expect(result.content).toEqual([
        {
          type: "text",
          text: "**John 3:16** (WEB)\n\nFor God so loved the world, that he gave his only born Son.",
        },
      ]);
      expect(result.isError).toBeFalsy();
      expect(getBibleTextMock).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("get_cross_references without a bible argument resolves locally when DEFAULT_BIBLE=WEB is set, without ever calling Biblia", async () => {
    process.env.DEFAULT_BIBLE = "WEB";
    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "get_cross_references",
        arguments: { passage: "John 3:16", key_terms: "loved world" },
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
