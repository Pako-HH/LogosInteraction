import { searchBible } from "../biblia-api.js";
import type { BibleSearchResult } from "../../types.js";
import type { SearchProvider, SearchOptions } from "./search-provider.js";

// Thin wrapper around the existing, unmodified biblia-api.ts. No behavior
// change: search() delegates its arguments straight through.
export class BibliaSearchProvider implements SearchProvider {
  // Biblia formally covers all 6 known codes — see
  // docs/16_MCP2_Zielarchitektur.md Abschnitt 5.
  supports(_translation: string): boolean {
    return true;
  }

  search(query: string, options?: SearchOptions): Promise<BibleSearchResult> {
    return searchBible(query, options ?? {});
  }
}
