import type { BibleSearchResult } from "../../types.js";

// Phase A (Provider-Abstraktion, see docs/16_MCP2_Zielarchitektur.md Abschnitt 7).
// Field name kept as `bible` (not `translation`, as sketched in the
// architecture doc) to match the existing terminology used throughout
// index.ts/biblia-api.ts and avoid introducing a second name for the same
// concept during this pure-abstraction phase.
export interface SearchOptions {
  bible?: string;
  limit?: number;
  mode?: string;
}

export interface SearchProvider {
  supports(translation: string): boolean;
  search(query: string, options?: SearchOptions): Promise<BibleSearchResult>;
}
