import { getBibleText } from "../biblia-api.js";
import type { BibleTextResult } from "../../types.js";
import type { BibleTextProvider } from "./bible-text-provider.js";

// Thin wrapper around the existing, unmodified biblia-api.ts. No behavior
// change: resolveText() delegates its arguments straight through.
export class BibliaBibleTextProvider implements BibleTextProvider {
  // Biblia formally covers all 6 known codes (LEB, KJV, ASV, DARBY, YLT,
  // WEB) — see docs/16_MCP2_Zielarchitektur.md Abschnitt 5.
  supports(_translation: string): boolean {
    return true;
  }

  resolveText(passage: string, translation: string): Promise<BibleTextResult> {
    return getBibleText(passage, translation);
  }
}
