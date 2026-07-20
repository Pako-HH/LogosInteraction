import type { BibleSearchHit } from "../../types.js";

// Phase A (Provider-Abstraktion, see docs/16_MCP2_Zielarchitektur.md Abschnitt 6).
export interface CrossReferenceResult {
  passage: string;
  results: BibleSearchHit[];
}

// `bible` added in the Phase 3 close-out (docs/24): previously
// findCrossReferences() always resolved DEFAULT_BIBLE internally, so it
// could never benefit from the local corpus even when the caller wanted
// WEB/KJV/ASV — a gap between this implementation and the "automatically
// benefits from the resolvers" expectation in
// docs/16_MCP2_Zielarchitektur.md §18 Phase D. Optional and additive: a
// caller that omits it gets byte-identical behavior to before (DEFAULT_BIBLE).
export interface CrossReferenceProvider {
  findCrossReferences(passage: string, keyTerms?: string, bible?: string): Promise<CrossReferenceResult>;
}
