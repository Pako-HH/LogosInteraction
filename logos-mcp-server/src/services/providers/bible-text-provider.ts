import type { BibleTextResult } from "../../types.js";

// Phase A (Provider-Abstraktion, see docs/16_MCP2_Zielarchitektur.md Abschnitt 5
// und Abschnitt 15 Resolver-Vertrag): abstracts "fetch the text of a passage"
// away from the concrete source (Biblia today; a bundled local corpus in a
// later phase). `translation` is required, matching the documented
// BibleTextResolver contract — callers resolve the DEFAULT_BIBLE fallback
// explicitly (`bible ?? DEFAULT_BIBLE`) before calling in, so the provider
// itself never has to guess a default.
export interface BibleTextProvider {
  supports(translation: string): boolean;
  resolveText(passage: string, translation: string): Promise<BibleTextResult>;
}
