import type { LocalBibleInfo } from "../../types.js";

// Phase A (Provider-Abstraktion, see docs/16_MCP2_Zielarchitektur.md Abschnitt 8).
// Async to stay structurally consistent with the other three provider
// interfaces, even though the current (and only) implementation is a
// synchronous catalog lookup under the hood.
export interface TranslationProvider {
  listAvailable(query?: string): Promise<LocalBibleInfo[]>;
}
