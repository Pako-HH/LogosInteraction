import { DEFAULT_BIBLE } from "../../config.js";
import type { BibleSearchResult } from "../../types.js";
import type { SearchProvider, SearchOptions } from "./search-provider.js";

// Phase 3D-6: same composition pattern as bible-text-resolver.ts (Phase
// 3D-5) — local-first, Biblia only as fallback for a translation the local
// corpus doesn't cover. Both providers nullable for the same reason
// documented in bible-text-resolver.ts: LocalSearchProvider's constructor
// throws if the corpus file is missing, and letting that propagate out of
// index.ts's module-level instantiation would crash the whole server
// rather than gracefully degrading to Biblia-only.
export class SearchResolver implements SearchProvider {
  constructor(
    private readonly local: SearchProvider | null,
    private readonly biblia: SearchProvider | null
  ) {}

  supports(translation: string): boolean {
    return (this.local?.supports(translation) ?? false) || (this.biblia?.supports(translation) ?? false);
  }

  async search(query: string, options?: SearchOptions): Promise<BibleSearchResult> {
    // SearchOptions.bible is optional (search-provider.ts) — resolved here
    // once, so the local-vs-biblia decision is made against a concrete
    // translation, exactly mirroring how BibleTextResolver's caller
    // (index.ts) resolves `bible ?? DEFAULT_BIBLE` before calling in for
    // get_bible_text. search_bible's handler does not do this itself (see
    // docs/23_Phase3D6_LocalSearchProvider.md), so the resolver does it.
    const bible = options?.bible ?? DEFAULT_BIBLE;

    if (this.local?.supports(bible)) {
      return this.local.search(query, { ...options, bible });
    }
    if (this.biblia?.supports(bible)) {
      return this.biblia.search(query, options);
    }
    throw new Error(
      `Translation "${bible}" is not available (no local corpus coverage and no Biblia fallback configured).`
    );
  }
}
