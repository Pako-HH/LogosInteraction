# Logos Bible Software MCP Server + Socratic Bible Study Agent

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that connects [Claude Code](https://docs.anthropic.com/en/docs/claude-code) to [Logos Bible Software](https://www.logos.com/), plus a custom Socratic Bible study agent that uses these tools for guided theological dialogue.

## What This Does

- **20 MCP tools** that let Claude read Bible text, search Scripture, navigate Logos, access your notes/highlights/favorites, check reading plans, explore word studies and factbook entries, search your library catalog, open commentaries and lexicons, and run cross-resource searches
- **16 of the 20 tools have never needed any external API key** (your Logos SQLite databases, the local library catalog, and local reference logic)
- **Local-first Bible text and search**: `get_bible_text`, `get_passage_context`, `search_bible`, and `get_cross_references` now work entirely offline too, for the **WEB, KJV, and ASV** translations — reading from a local SQLite+FTS5 corpus you can build once (see [Optional: Build the Local Bible Corpus](#optional-build-the-local-bible-corpus)). Without an explicit `bible` parameter, these four tools still default to **LEB** and fall back to the Biblia API for it (LEB is copyrighted, not public domain, so it's never bundled locally) — see [How It Works](#how-it-works)
- **A Socratic Bible Study agent** that guides you through Scripture using questions (not lectures), welcoming any denominational background, with four questioning layers: Observation, Interpretation, Correlation, and Application

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **macOS** | Required (uses the macOS `open` command with `logos4:`/`logosres:` URL schemes for Logos integration) |
| **Logos Bible Software** | Installed at `/Applications/Logos.app` (tested with v48) |
| **Node.js** | v18+ (v23+ recommended for native `fetch` support) |
| **Claude Code** | Anthropic's CLI tool ([install guide](https://docs.anthropic.com/en/docs/claude-code)) |
| **Biblia API Key** | *Optional.* Free key from [bibliaapi.com](https://bibliaapi.com/) — only needed if you ask `get_bible_text`/`get_passage_context`/`search_bible`/`get_cross_references` for a translation other than WEB/KJV/ASV (including the default, LEB), or if you haven't built the local Bible corpus. The other 16 tools never need it |

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/robrawks/LogosInteraction.git
cd LogosInteraction
```

### 2. Install dependencies and build

```bash
cd logos-mcp-server
npm install
npm run build
cd ..
```

### 3. Get a Biblia API key (optional)

Only needed for LEB (the default translation) or any translation other than WEB/KJV/ASV — see [Optional: Build the Local Bible Corpus](#optional-build-the-local-bible-corpus) below for a fully offline alternative covering WEB/KJV/ASV.

1. Go to [bibliaapi.com](https://bibliaapi.com/)
2. Sign up for a free account
3. Copy your API key

### 4. Create `.mcp.json` in the project root

```json
{
  "mcpServers": {
    "logos": {
      "command": "node",
      "args": ["logos-mcp-server/dist/index.js"],
      "env": {
        "BIBLIA_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### 5. Create `.env` in the project root (optional, for development)

```
BIBLIA_API_KEY=your_api_key_here
```

### 6. Verify it works

```bash
claude
```

Once Claude Code starts, type `/mcp` to check that the "logos" server appears with 20 tools.

## Optional: Build the Local Bible Corpus

`get_bible_text`, `get_passage_context`, `search_bible`, and `get_cross_references` can answer WEB, KJV, and ASV requests entirely offline, from a local SQLite+FTS5 database — no Biblia API key needed for those three translations. This is optional: without it, all four tools still work exactly as before, via the Biblia API (requires a key, see above).

To build it:

1. Download the "BibleWorks (VPL)" plain-text archive for each translation from [eBible.org](https://eBible.org/Scriptures/) (public domain — see [eBible.org's copyright page](https://ebible.org/eng-web/copyright.htm) for WEB):
   - WEB: `https://eBible.org/Scriptures/eng-web_vpl.zip`
   - KJV: `https://eBible.org/Scriptures/eng-kjv_vpl.zip`
   - ASV: `https://eBible.org/Scriptures/eng-asv_vpl.zip`
2. Unzip each archive and locate the `..._vpl.txt` file inside.
3. From `logos-mcp-server/`, run the build script once per translation (it accumulates all three into one file):
   ```bash
   npx tsx scripts/build-bible-corpus.ts WEB /path/to/eng-web_vpl.txt
   npx tsx scripts/build-bible-corpus.ts KJV /path/to/eng-kjv_vpl.txt
   npx tsx scripts/build-bible-corpus.ts ASV /path/to/eng-asv_vpl.txt
   ```
4. This writes `logos-mcp-server/data/bible-corpus/bible-corpus.db` (not committed to the repo — it's a local build artifact, like `dist/`). The server picks it up automatically on the next start; no `.mcp.json` changes needed. Override the location with the `LOCAL_BIBLE_CORPUS_PATH` environment variable if you'd rather keep it elsewhere.

If the corpus file is missing or not yet built, the four tools simply behave as they did before this feature existed (Biblia-only) — nothing breaks either way.

## Available Tools

### Bible Text & Reading
Tools for retrieving, reading, and comparing Bible text

| Tool | What it does |
|------|-------------|
| `get_bible_text` | Retrieves passage text. **Local, no API key** for `bible: WEB\|KJV\|ASV` (if the local corpus is built). Falls back to the Biblia API — **requires `BIBLIA_API_KEY`** — for the default (LEB) or any other translation |
| `get_passage_context` | Gets a passage with surrounding verses for context — same local-first/Biblia-fallback behavior as `get_bible_text` (calls the same resolver internally) |
| `compare_passages` | Compares two Bible references for overlap, subset, or ordering — pure local reference logic, no API key needed |
| `get_available_bibles` | Lists Bible translations installed in your local Logos library, read from the local catalog — no API key needed. Note: this may list more translations than `get_bible_text` can actually retrieve (only WEB/KJV/ASV locally, or LEB/others via Biblia) |

### Navigation & UI
Tools that open things in the Logos desktop app

| Tool | What it does |
|------|-------------|
| `navigate_passage` | Opens a passage in the Logos UI |
| `open_word_study` | Opens a word study in Logos (Greek/Hebrew/English) |
| `open_factbook` | Opens a Factbook entry for a person, place, event, or topic |
| `open_resource` | Opens a specific commentary, lexicon, or other resource in Logos at a passage |
| `open_guide` | Opens an Exegetical Guide or Passage Guide for a Bible passage |

### Search & Discovery
Tools for searching Bible text and library resources

| Tool | What it does |
|------|-------------|
| `search_bible` | Searches Bible text for words or exact phrases. **Local, no API key** for `bible: WEB\|KJV\|ASV` (if the local corpus is built) — multi-word queries match as an exact phrase, not "contains all words anywhere". Falls back to the Biblia API for the default (LEB) or any other translation |
| `get_cross_references` | Finds related passages by extracting key terms (or using `key_terms` directly) and searching for them — same local-first/Biblia-fallback behavior as `search_bible`, now also accepts an optional `bible` parameter. Without it, defaults to LEB (Biblia) as before |
| `scan_references` | Finds Bible references embedded in arbitrary text (English and German book names) — local text scanning, no API key needed |
| `search_all` | Searches across ALL resources in your library (not just Bible text) — opens the search in the Logos UI |

### Library & Resources
Tools for browsing your owned library catalog

| Tool | What it does |
|------|-------------|
| `get_library_catalog` | Searches your owned resources (commentaries, lexicons, etc.) by type, author, or keyword |
| `get_resource_types` | Shows a summary of resource types and counts in your library |

### Personal Study Data
Tools for accessing your notes, highlights, favorites, and reading progress

| Tool | What it does |
|------|-------------|
| `get_user_notes` | Reads your study notes from Logos |
| `get_user_highlights` | Reads your highlights and visual markup |
| `get_favorites` | Lists your saved favorites/bookmarks |
| `get_reading_progress` | Shows your reading plan status |

### Study Workflows
Tools for structured study paths

| Tool | What it does |
|------|-------------|
| `get_study_workflows` | Lists available study workflow templates and active instances |

## Using the Socratic Bible Study Agent

Start Claude Code in the project directory, then:

```
/agent socratic-bible-study
```

The agent will ask what you want to study and guide you through Scripture using the Socratic method. It's tradition-neutral -- it works with any denominational background and presents multiple perspectives where Christians disagree. It guides you through four layers:

1. **Observation** - "What does the text say?"
2. **Interpretation** - "What does the text mean?"
3. **Correlation** - "How does this relate to the rest of Scripture?"
4. **Application** - "What does this mean for us?"

### Example session starters

- "Let's study Romans 8:28-30"
- "I want to do a word study on 'justification'"
- "What does the Bible teach about grace?"
- "Walk me through Psalm 23"

## Project Structure

```
LogosInteraction/
├── .claude/
│   └── agents/
│       └── socratic-bible-study.md    # Socratic agent definition
├── .mcp.json                          # MCP server config (you create this)
├── .env                               # API key (you create this)
├── logos-mcp-server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                   # MCP server entry point (20 tools)
│   │   ├── config.ts                  # Paths (with install-dir autodetection), API config, constants
│   │   ├── types.ts                   # Shared TypeScript types
│   │   ├── data/
│   │   │   └── versification.ts       # Bundled book/chapter/verse table for local reference comparison
│   │   └── services/
│   │       ├── reference-parser.ts    # Bible reference normalization
│   │       ├── reference-compare.ts   # Local passage comparison logic (compare_passages)
│   │       ├── reference-scanner.ts   # Local reference scanning in free text (scan_references)
│   │       ├── biblia-api.ts          # Biblia.com REST API client
│   │       ├── logos-app.ts           # macOS URL scheme integration
│   │       ├── sqlite-reader.ts       # Read-only Logos SQLite access
│   │       ├── catalog-reader.ts      # Library catalog search (catalog.db)
│   │       └── providers/             # Provider abstraction: local-first Bible text/search, Biblia fallback
│   │           ├── bible-text-provider.ts, search-provider.ts, cross-reference-provider.ts,
│   │           │   translation-provider.ts        # Interfaces
│   │           ├── biblia-*.ts, local-*.ts         # Biblia-backed and local (SQLite) implementations
│   │           └── bible-text-resolver.ts, search-resolver.ts  # Local-first-with-Biblia-fallback composition
│   ├── scripts/
│   │   └── build-bible-corpus.ts      # One-time build script: raw VPL text -> local SQLite+FTS5 corpus
│   ├── data/bible-corpus/             # Build output (not committed — see "Optional: Build the Local Bible Corpus")
│   └── dist/                          # Built output (after npm run build)
```

## How It Works

The MCP server integrates with Logos and Bible text through five channels:

- **Local Bible corpus** - `get_bible_text`, `get_passage_context`, `search_bible`, and `get_cross_references` read from a local SQLite+FTS5 database (built as described above) for the WEB, KJV, and ASV translations — no network access, no API key. A small resolver picks this first and only falls back to Biblia when the requested translation isn't in the local corpus
- **Biblia API** - Retrieves Bible text and full-text search results via the free REST API from Faithlife (same company as Logos), used as a fallback by the same four tools — for the default translation (LEB, which is copyrighted and never bundled locally) or any translation other than WEB/KJV/ASV
- **macOS URL schemes** - Opens passages, word studies, and factbook entries directly in the Logos app using `logos4:///` URLs
- **SQLite databases** - Reads your personal data (notes, highlights, favorites, workflows, reading plans) and library catalog directly from the Logos local database files (read-only access, never modifies your data)
- **Local reference logic** - `compare_passages` and `scan_references` work entirely offline using built-in reference parsing and a bundled versification table (no Bible text or API access needed)

## Logos Data Path

The server automatically detects your Logos installation folder under:

```
~/Library/Application Support/Logos4/Documents/<your-install-id>/
~/Library/Application Support/Logos4/Data/<your-install-id>/
```

Logos generates a unique per-machine install ID for these folders, so no manual configuration is normally needed. If detection picks the wrong folder (e.g. multiple Logos profiles on one machine) or your data lives somewhere else, override it by setting `LOGOS_DATA_DIR` in `.mcp.json`. The library catalog lives under `Data/` (not `Documents/`) — set `LOGOS_CATALOG_DIR` if your catalog path differs:

```json
{
  "mcpServers": {
    "logos": {
      "command": "node",
      "args": ["logos-mcp-server/dist/index.js"],
      "env": {
        "BIBLIA_API_KEY": "your_key",
        "LOGOS_DATA_DIR": "/path/to/your/Logos4/Documents/xxxx.w14",
        "LOGOS_CATALOG_DIR": "/path/to/your/Logos4/Data/xxxx.w14"
      }
    }
  }
}
```

## Troubleshooting

**"BIBLIA_API_KEY is not set"** - Only relevant for LEB (the default) or other non-local translations. Either add the `env` block with your API key to `.mcp.json`, or pass `bible: "WEB"` (or `"KJV"`/`"ASV"`) explicitly and [build the local corpus](#optional-build-the-local-bible-corpus) instead.

**"Local Bible corpus not found"** - You asked for `bible: "WEB"`/`"KJV"`/`"ASV"` but haven't built the local corpus yet — see [Optional: Build the Local Bible Corpus](#optional-build-the-local-bible-corpus). This only affects those three translations; everything else keeps working via Biblia.

**"Database not found"** - Your Logos data path may differ. Run `find ~/Library/Application\ Support/Logos4 -name "*.db" -maxdepth 5` to find your databases and update `LOGOS_DATA_DIR`.

**Tools don't appear in `/mcp`** - Restart Claude Code. The MCP server is loaded at startup from `.mcp.json`.

**Logos doesn't open passages** - Make sure Logos Bible Software is running before using `navigate_passage`, `open_word_study`, or `open_factbook`.

## License

MIT
