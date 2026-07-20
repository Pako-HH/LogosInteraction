import type { BibleTextResult } from "../../types.js";
import type { BibleTextProvider } from "./bible-text-provider.js";

// Phase 3D-5: composes a primary (local) and fallback (Biblia) BibleTextProvider,
// per the target design in docs/16_MCP2_Zielarchitektur.md §4/§15. Local-first:
// the fallback is only consulted for a translation the local provider doesn't
// cover (in practice today: LEB — see docs/15_Biblia_Restabhaengigkeit_Analyse.md
// Abschnitt 4, not gemeinfrei, never bundled into the local corpus).
//
// Both providers are typed nullable — deliberately looser than
// docs/16_MCP2_Zielarchitektur.md §15's literal
// `constructor(local: LocalBibleTextProvider, biblia: BibliaBibleTextProvider | null)`
// signature. Reason: LocalBibleTextProvider's constructor throws if the
// corpus file is missing (Phase 3D-4). If that were allowed to propagate out
// of index.ts's module-level provider instantiation, the *entire server*
// would fail to start whenever the corpus hasn't been built yet — a far
// larger regression than any single tool call failing. index.ts catches that
// construction error and passes `null` for `local` instead, so a missing
// corpus degrades gracefully to exactly the pre-3D-5 behavior (Biblia for
// every translation), not a crash. See docs/22 for the full rationale.
export class BibleTextResolver implements BibleTextProvider {
  constructor(
    private readonly local: BibleTextProvider | null,
    private readonly biblia: BibleTextProvider | null
  ) {}

  supports(translation: string): boolean {
    return (this.local?.supports(translation) ?? false) || (this.biblia?.supports(translation) ?? false);
  }

  async resolveText(passage: string, translation: string): Promise<BibleTextResult> {
    if (this.local?.supports(translation)) {
      return this.local.resolveText(passage, translation);
    }
    if (this.biblia?.supports(translation)) {
      return this.biblia.resolveText(passage, translation);
    }
    throw new Error(
      `Translation "${translation}" is not available (no local corpus coverage and no Biblia fallback configured).`
    );
  }
}
