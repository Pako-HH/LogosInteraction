import { parseReference, BOOK_ORDER } from "./reference-parser.js";
import { versesInChapter } from "../data/versification.js";
import type { ParsedReference, CompareResult } from "../types.js";

// A verse-level position, comparable lexicographically: [bookIndex, chapter, verse].
type Position = [number, number, number];

function bookIndex(book: string): number {
  const idx = BOOK_ORDER.indexOf(book);
  if (idx === -1) throw new Error(`Book not found in canonical order: "${book}"`);
  return idx;
}

// Falls back to a very large verse number when the exact chapter length is
// unknown (e.g. a future/unrecognized book), so an open-ended chapter is
// still treated as "runs to the end of the chapter" rather than crashing.
function lastVerseOf(book: string, chapter: number): number {
  return versesInChapter(book, chapter) ?? Number.MAX_SAFE_INTEGER;
}

function startPosition(ref: ParsedReference): Position {
  return [bookIndex(ref.book), ref.chapter, ref.verse ?? 1];
}

function endPosition(ref: ParsedReference): Position {
  const idx = bookIndex(ref.book);
  if (ref.endChapter !== undefined) {
    const endVerse = ref.endVerse ?? lastVerseOf(ref.book, ref.endChapter);
    return [idx, ref.endChapter, endVerse];
  }
  if (ref.verse !== undefined) {
    return [idx, ref.chapter, ref.verse];
  }
  // Chapter-only reference (e.g. "Genesis 1"): covers the whole chapter.
  return [idx, ref.chapter, lastVerseOf(ref.book, ref.chapter)];
}

function comparePositions(a: Position, b: Position): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// Compares two Bible references for overlap/containment/ordering, entirely
// from parsed reference structure — no external API or Bible text needed.
// Field semantics match the previous Biblia-backed implementation:
//   subset   = first's range is fully contained within second's range
//   superset = second's range is fully contained within first's range
export function compareReferences(first: string, second: string): CompareResult {
  const r1 = parseReference(first);
  const r2 = parseReference(second);

  const s1 = startPosition(r1);
  const e1 = endPosition(r1);
  const s2 = startPosition(r2);
  const e2 = endPosition(r2);

  const equal = comparePositions(s1, s2) === 0 && comparePositions(e1, e2) === 0;
  const subset = comparePositions(s2, s1) <= 0 && comparePositions(e1, e2) <= 0;
  const superset = comparePositions(s1, s2) <= 0 && comparePositions(e2, e1) <= 0;
  const intersects = comparePositions(s1, e2) <= 0 && comparePositions(s2, e1) <= 0;
  const before = comparePositions(e1, s2) < 0;
  const after = comparePositions(s1, e2) > 0;

  return { equal, intersects, subset, superset, before, after };
}
