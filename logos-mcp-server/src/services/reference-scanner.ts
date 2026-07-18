import { KNOWN_BOOK_TOKENS, resolveKnownBookToken } from "./reference-parser.js";
import { chapterCount, versesInChapter } from "../data/versification.js";
import type { ScanResult } from "../types.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Built once at module load: a whitelist alternation of every known book
// name/alias (English + German, see reference-parser.ts), longest first so
// e.g. "1 John" is preferred over the shorter "John" when both could match
// at the same text position. Matching against a whitelist of real book
// tokens — rather than a generic "word(s) + number" pattern — is what keeps
// this scanner from flagging arbitrary text like "in the year 1994" as a
// reference: "year" is simply not a recognized token.
const BOOK_TOKEN_PATTERN = [...KNOWN_BOOK_TOKENS]
  .sort((a, b) => b.length - a.length)
  .map((token) => escapeRegExp(token).replace(/ /g, "\\s+"))
  .join("|");

// Chapter/verse separator accepts both ":" (English) and "," (German, e.g.
// "Johannes 3,16") — a scanner-local concern, deliberately not added to
// parseReference()'s stricter single-reference grammar used elsewhere.
//
// The book token is captured (group 1), not just consumed, because several
// tokens themselves start with a digit (e.g. "1 Mose", "1 John") — without a
// capture group there'd be no reliable way to tell the book's leading digit
// apart from the chapter number that follows it.
const SCAN_REGEX = new RegExp(
  `\\b(${BOOK_TOKEN_PATTERN})\\.?\\s+(\\d+)(?:[:,](\\d+))?(?:\\s*[-–]\\s*(\\d+)(?:[:,](\\d+))?)?`,
  "gi"
);

function formatPassage(
  book: string,
  chapter: number,
  verse: number | undefined,
  endChapter: number | undefined,
  endVerse: number | undefined
): string {
  let result = `${book} ${chapter}`;
  if (verse !== undefined) result += `:${verse}`;
  if (endChapter !== undefined) {
    if (endVerse !== undefined) {
      result += endChapter !== chapter ? `-${endChapter}:${endVerse}` : `-${endVerse}`;
    } else {
      result += `-${endChapter}`;
    }
  }
  return result;
}

// Rejects matches whose chapter/verse numbers fall outside the book's actual
// range (per data/versification.ts) — catches cases like "Genesis 500",
// where the token match is real but the reference itself cannot exist.
// Unknown books (not expected, since bookName always comes from
// resolveKnownBookToken) fail open rather than rejecting the match.
function isPlausible(book: string, chapter: number, verse?: number, endChapter?: number, endVerse?: number): boolean {
  const chapters = chapterCount(book);
  if (chapters !== null && chapter > chapters) return false;
  if (verse !== undefined) {
    const maxVerse = versesInChapter(book, chapter);
    if (maxVerse !== null && verse > maxVerse) return false;
  }
  if (endChapter !== undefined && chapters !== null && endChapter > chapters) return false;
  if (endChapter !== undefined && endVerse !== undefined) {
    const maxEndVerse = versesInChapter(book, endChapter);
    if (maxEndVerse !== null && endVerse > maxEndVerse) return false;
  }
  return true;
}

// Finds Bible references embedded in free text — English or German book
// names, ":" or "," as the chapter/verse separator — entirely locally, no
// Biblia API call. See docs/13_Implementierungsplan_Migration.md Tool 3.
export function scanReferencesLocal(text: string, tagChapters: boolean = true): ScanResult[] {
  const results: ScanResult[] = [];
  SCAN_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = SCAN_REGEX.exec(text)) !== null) {
    const book = resolveKnownBookToken(match[1]);
    if (!book) continue; // Defensive: shouldn't happen, the regex only matches known tokens.

    const chapter = parseInt(match[2], 10);
    const verse = match[3] !== undefined ? parseInt(match[3], 10) : undefined;
    const rangeNum = match[4] !== undefined ? parseInt(match[4], 10) : undefined;
    const rangeVerse = match[5] !== undefined ? parseInt(match[5], 10) : undefined;

    // Mirrors parseReference()'s own range semantics: a trailing number after
    // "-" with no verse on the base reference is an end CHAPTER (e.g.
    // "Genesis 1-3"); with a verse on the base reference, it's an end VERSE
    // in the *same* chapter (e.g. "Romans 8:28-30") unless a second, colon-
    // separated number follows it too (e.g. "Genesis 1:1-2:3").
    let endChapter: number | undefined;
    let endVerse: number | undefined;
    if (verse === undefined) {
      endChapter = rangeNum;
    } else if (rangeNum !== undefined && rangeVerse === undefined) {
      endChapter = chapter;
      endVerse = rangeNum;
    } else if (rangeNum !== undefined && rangeVerse !== undefined) {
      endChapter = rangeNum;
      endVerse = rangeVerse;
    }

    if (verse === undefined && !tagChapters) continue;
    if (!isPlausible(book, chapter, verse, endChapter, endVerse)) continue;

    results.push({ passage: formatPassage(book, chapter, verse, endChapter, endVerse) });
  }

  return results;
}
