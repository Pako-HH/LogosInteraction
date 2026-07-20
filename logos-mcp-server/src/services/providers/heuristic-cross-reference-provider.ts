import { DEFAULT_BIBLE } from "../../config.js";
import type { BibleTextProvider } from "./bible-text-provider.js";
import type { SearchProvider } from "./search-provider.js";
import type { CrossReferenceProvider, CrossReferenceResult } from "./cross-reference-provider.js";

// Extracted verbatim from the former get_cross_references handler in
// index.ts (stopword-filtered keyword extraction + search + self-reference
// exclusion) — no logic change, only relocation behind a Provider interface.
// As documented in docs/16_MCP2_Zielarchitektur.md Abschnitt 6, this remains
// a heuristic, not a curated cross-reference dataset, regardless of which
// BibleTextProvider/SearchProvider it is composed with.
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
  "by", "from", "is", "are", "was", "were", "be", "been", "have", "has", "had", "do",
  "does", "did", "will", "would", "could", "should", "may", "might", "shall", "that",
  "this", "these", "those", "it", "its", "he", "she", "they", "them", "his", "her",
  "their", "not", "no", "nor", "as", "if", "then", "than", "so", "all", "who", "which",
  "what", "when", "where", "how", "i", "me", "my", "we", "us", "you", "your", "him",
  "up", "out", "into", "upon",
]);

export class HeuristicCrossReferenceProvider implements CrossReferenceProvider {
  constructor(
    private readonly bibleText: BibleTextProvider,
    private readonly search: SearchProvider
  ) {}

  async findCrossReferences(passage: string, keyTerms?: string, bible?: string): Promise<CrossReferenceResult> {
    // Phase 3 close-out (docs/24): resolved once, used for BOTH the
    // optional text lookup and the search call, so a caller-supplied
    // translation (e.g. "WEB") actually reaches the local corpus on both
    // steps — not just one of them. Omitting `bible` preserves the exact
    // prior behavior (DEFAULT_BIBLE for both steps).
    const effectiveBible = bible ?? DEFAULT_BIBLE;

    let searchQuery: string;
    if (keyTerms) {
      searchQuery = keyTerms;
    } else {
      const passageResult = await this.bibleText.resolveText(passage, effectiveBible);
      const words = passageResult.text
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP_WORDS.has(w.toLowerCase()))
        .slice(0, 5);
      searchQuery = words.join(" ");
    }
    const results = await this.search.search(searchQuery, { limit: 15, bible: effectiveBible });
    const filtered = results.results.filter(
      (r) => r.title.toLowerCase() !== passage.toLowerCase()
    );
    return { passage, results: filtered };
  }
}
