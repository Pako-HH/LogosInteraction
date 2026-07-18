import type { BibleSearchHit } from "../../types.js";

// Phase A (Provider-Abstraktion, see docs/16_MCP2_Zielarchitektur.md Abschnitt 6).
export interface CrossReferenceResult {
  passage: string;
  results: BibleSearchHit[];
}

export interface CrossReferenceProvider {
  findCrossReferences(passage: string, keyTerms?: string): Promise<CrossReferenceResult>;
}
