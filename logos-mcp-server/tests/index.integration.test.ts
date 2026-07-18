import { describe, it, expect, vi, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Real end-to-end check (Point 2 of the Phase 3A review): connects a genuine
// MCP Client to the genuine server built by createServer() over an in-memory
// transport pair — the same McpServer/tool-registration/schema-validation
// path a real Claude Code session uses, just without stdio. Only the
// network-dependent biblia-api.ts layer is mocked, so the response text is
// produced by the exact same formatting code in index.ts that ran before
// the Phase 3A provider refactor.
const getBibleTextMock = vi.fn();
const searchBibleMock = vi.fn();

vi.mock("../src/services/biblia-api.js", () => ({
  getBibleText: getBibleTextMock,
  searchBible: searchBibleMock,
}));

const { createServer } = await import("../src/index.js");

async function connectedClient() {
  const server = createServer();
  const client = new Client({ name: "phase-3a-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

describe("get_bible_text (real MCP round-trip via createServer())", () => {
  afterEach(() => {
    getBibleTextMock.mockReset();
    searchBibleMock.mockReset();
  });

  it("produces the exact pre-refactor markdown response for a passage lookup with an explicit bible", async () => {
    getBibleTextMock.mockResolvedValue({
      passage: "John 3:16",
      text: "For God so loved the world that he gave his only Son.",
      bible: "WEB",
    });

    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "get_bible_text",
        arguments: { passage: "John 3:16", bible: "WEB" },
      });

      // Byte-identical to the format string that lived directly in index.ts
      // before Phase 3A: `**${result.passage}** (${result.bible})\n\n${result.text}`
      expect(result.content).toEqual([
        {
          type: "text",
          text: "**John 3:16** (WEB)\n\nFor God so loved the world that he gave his only Son.",
        },
      ]);
      expect(result.isError).toBeFalsy();

      // Confirms the provider layer actually reached biblia-api.ts with the
      // right arguments — not a hand-rolled stand-in for the real call chain.
      expect(getBibleTextMock).toHaveBeenCalledExactlyOnceWith("John 3:16", "WEB");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("falls back to DEFAULT_BIBLE when no bible argument is given, same as before the refactor", async () => {
    const { DEFAULT_BIBLE } = await import("../src/config.js");
    getBibleTextMock.mockResolvedValue({
      passage: "Romans 8:28",
      text: "And we know that in all things God works for the good...",
      bible: DEFAULT_BIBLE,
    });

    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "get_bible_text",
        arguments: { passage: "Romans 8:28" },
      });

      expect(result.content).toEqual([
        {
          type: "text",
          text: `**Romans 8:28** (${DEFAULT_BIBLE})\n\nAnd we know that in all things God works for the good...`,
        },
      ]);
      expect(getBibleTextMock).toHaveBeenCalledExactlyOnceWith("Romans 8:28", DEFAULT_BIBLE);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("surfaces a Biblia error as isError:true through the real MCP error path", async () => {
    getBibleTextMock.mockRejectedValue(new Error("Biblia API error 403: Access is denied."));

    const { client, server } = await connectedClient();
    try {
      const result = await client.callTool({
        name: "get_bible_text",
        arguments: { passage: "John 3:16", bible: "LEB" },
      });

      expect(result.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
