import { getInstalledBibles } from "../catalog-reader.js";
import type { LocalBibleInfo } from "../../types.js";
import type { TranslationProvider } from "./translation-provider.js";

// Thin wrapper around the existing, unmodified catalog-reader.ts. No
// behavior change: listAvailable() delegates straight through to the
// already-migrated getInstalledBibles() (catalog.db, Type='text.monograph.bible').
export class LocalTranslationProvider implements TranslationProvider {
  async listAvailable(query?: string): Promise<LocalBibleInfo[]> {
    return getInstalledBibles(query);
  }
}
