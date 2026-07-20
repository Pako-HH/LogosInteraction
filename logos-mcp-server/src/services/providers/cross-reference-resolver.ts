import type { CrossReferenceProvider, CrossReferenceResult } from "./cross-reference-provider.js";

// Phase 4C-4: composes a primary (local, curated) and fallback (heuristic)
// CrossReferenceProvider, same local-first composition role as
// bible-text-resolver.ts/search-resolver.ts. `local` is nullable for the
// same reason documented there: LocalCrossReferenceProvider's constructor
// throws if the corpus file is missing (Phase 4C-3), and letting that
// propagate out of index.ts's module-level provider instantiation would
// crash the whole server rather than gracefully degrading to the
// heuristic-only behavior that already existed before this phase. `heuristic`
// is not nullable — HeuristicCrossReferenceProvider has no such
// missing-file failure mode, so it can always be constructed.
//
// Fallback trigger, deliberately broader than BibleTextResolver's/
// SearchResolver's supports()-based check: CrossReferenceProvider has no
// supports() method to consult up front, and unlike a missing Bible verse
// (a real data problem), the local provider's own failure modes here —  a
// whole-chapter passage (cross-references are inherently per-verse, see
// docs/28 Schritt 4C-3) or a translation the local corpus doesn't cover —
// are themselves legitimate "not locally applicable" signals, not
// data-integrity failures. A passage that IS well-formed but has zero
// curated cross-references in the corpus is treated the same way (falls
// through to heuristic), matching Schritt 4C-4's plain-language framing in
// docs/28_Phase4_Masterplan.md ("lokal nicht abgedeckt").
export class CrossReferenceResolver implements CrossReferenceProvider {
  constructor(
    private readonly local: CrossReferenceProvider | null,
    private readonly heuristic: CrossReferenceProvider
  ) {}

  async findCrossReferences(passage: string, keyTerms?: string, bible?: string): Promise<CrossReferenceResult> {
    if (this.local) {
      try {
        const localResult = await this.local.findCrossReferences(passage, keyTerms, bible);
        if (localResult.results.length > 0) {
          return { ...localResult, source: "local-curated" };
        }
      } catch {
        // Falls through to the heuristic fallback below.
      }
    }
    const heuristicResult = await this.heuristic.findCrossReferences(passage, keyTerms, bible);
    return { ...heuristicResult, source: "heuristic" };
  }
}
