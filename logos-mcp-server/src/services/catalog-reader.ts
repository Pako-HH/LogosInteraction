import Database from "better-sqlite3";
import { existsSync } from "fs";
import { DB_PATHS } from "../config.js";
import { stripXml } from "../utils/strip-markup.js";
import type { CatalogResource, ResourceTypeSummary, LocalBibleInfo } from "../types.js";

function openDb(path: string): Database.Database {
  if (!existsSync(path)) {
    throw new Error(`Database not found: ${path}`);
  }
  return new Database(path, { readonly: true, fileMustExist: true });
}

// Opens the library catalog with error messages safe to show an end user:
// no local filesystem paths (which embed the OS username) ever leak out.
function openCatalogDbSafely(): Database.Database {
  if (!existsSync(DB_PATHS.catalog)) {
    throw new Error(
      "Logos library catalog was not found. Make sure Logos Bible Software is installed and has been opened at least once on this machine."
    );
  }
  try {
    return new Database(DB_PATHS.catalog, { readonly: true, fileMustExist: true });
  } catch {
    throw new Error(
      "Logos library catalog could not be opened. It may be corrupted, or locked by another process (e.g. Logos is currently syncing)."
    );
  }
}

function splitDelimited(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

// ─── Human-friendly type labels ─────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  // Books & monographs
  "text.monograph": "Book",
  "text.monograph.collected-work": "Collected Work",
  "text.monograph.biography": "Biography",
  "text.monograph.autobiography": "Autobiography",
  "text.monograph.letters": "Letters",
  "text.monograph.festschrift": "Festschrift",
  "text.monograph.quotations": "Quotations",
  "text.monograph.illustrations": "Illustrations",
  "text.monograph.handbook": "Handbook",
  "text.monograph.workbook": "Workbook",
  "text.monograph.lecture": "Lecture",
  "text.monograph.prayers": "Prayers",
  // Bible & Bible-related
  "text.monograph.bible": "Bible",
  "text.bible": "Bible",
  "text.bible.interlinear": "Interlinear Bible",
  "text.monograph.bible.reference": "Bible Reference",
  "text.monograph.concordance.bible": "Concordance",
  "text.monograph.harmony.bible": "Harmony",
  "text.monograph.lectionary.bible": "Lectionary",
  "text.monograph.study.bible": "Study Bible",
  "text.monograph.notes.bible": "Bible Notes",
  "text.monograph.cross-references.bible": "Cross-References",
  "text.monograph.critical-apparatus.bible": "Critical Apparatus",
  "text.monograph.introduction.bible": "Bible Introduction",
  "text.monograph.introduction.new-testament": "NT Introduction",
  "text.monograph.survey.new-testament": "NT Survey",
  "text.monograph.bible-study": "Bible Study",
  "text.visualization.bible": "Bible Visualization",
  // Commentary
  "text.monograph.commentary.bible": "Commentary",
  "text.monograph.commentary": "Commentary",
  // Reference & dictionaries
  "text.monograph.dictionary": "Dictionary",
  "text.monograph.dictionary.bible": "Bible Dictionary",
  "text.monograph.dictionary.encyclopedia": "Encyclopedia",
  "text.monograph.dictionary.encyclopedia.bible": "Bible Encyclopedia",
  "text.monograph.dictionary.lexicon": "Lexicon",
  "text.monograph.dictionary.lexicon.greek": "Greek Lexicon",
  "text.monograph.dictionary.lexicon.hebrew": "Hebrew Lexicon",
  "text.monograph.encyclopedia": "Encyclopedia",
  "text.monograph.lexicon": "Lexicon",
  "text.monograph.glossary": "Glossary",
  "text.monograph.thesaurus": "Thesaurus",
  "text.monograph.bibliography": "Bibliography",
  // Theology
  "text.monograph.theology.systematic": "Systematic Theology",
  "text.monograph.systematic-theology": "Systematic Theology",
  "text.monograph.theology": "Theology",
  "text.monograph.biblical-theology": "Biblical Theology",
  // History & church
  "text.monograph.history": "History",
  "text.monograph.history.church": "Church History",
  "text.monograph.church-history": "Church History",
  "text.monograph.ancient-manuscript": "Ancient Manuscript",
  "text.monograph.ancient-manuscript.translation": "Ancient Text Translation",
  "text.monograph.earlyChurchFathers": "Early Church Fathers",
  // Sermons & devotional
  "text.monograph.sermons": "Sermons",
  "text.monograph.devotional": "Devotional",
  "text.monograph.hymnal": "Hymnal",
  "text.monograph.service-book": "Service Book",
  "text.monograph.catechism": "Catechism",
  "text.monograph.confessional-document": "Confessional Document",
  "text.monograph.creeds.confessions": "Creeds & Confessions",
  // Study & education
  "text.monograph.studynotes": "Study Notes",
  "text.monograph.study-guide": "Study Guide",
  "text.monograph.courseware": "Courseware",
  "text.monograph.grammar": "Grammar",
  "text.monograph.grammar.greek": "Greek Grammar",
  "text.monograph.grammar.hebrew": "Hebrew Grammar",
  "text.monograph.guide": "Guide",
  "text.monograph.atlas": "Atlas",
  "text.manual": "Manual",
  // Journals
  "text.monograph.journal": "Journal",
  "text.serial.journal": "Journal",
  // Interactive & media
  "lbx.media": "Media",
  "lbx.media.courseware": "Interactive Courseware",
  "lbx.interactive": "Interactive Resource",
  "lbx.calendar-devotional": "Daily Devotional",
  "lbx.timelines": "Timeline",
  "lbx.biblicalpeoplediagrams": "People Diagrams",
  "lbx.biblicalplacesmaps": "Place Maps",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.split(".").pop() ?? type;
}

// ─── Search Catalog ─────────────────────────────────────────────────────────

export function searchCatalog(options: {
  type?: string;
  query?: string;
  author?: string;
  limit?: number;
} = {}): CatalogResource[] {
  const db = openDb(DB_PATHS.catalog);
  try {
    let sql = `
      SELECT ResourceId, Title, AbbreviatedTitle, Type, Authors,
             Subjects, Description, PublicationDate
      FROM Records
      WHERE Availability >= 1 AND IsDataset = 0
    `;
    const params: unknown[] = [];

    if (options.type) {
      sql += " AND Type LIKE ?";
      params.push(`%${options.type}%`);
    }
    if (options.query) {
      sql += " AND (Title LIKE ? OR Description LIKE ? OR Subjects LIKE ?)";
      const q = `%${options.query}%`;
      params.push(q, q, q);
    }
    if (options.author) {
      sql += " AND Authors LIKE ?";
      params.push(`%${options.author}%`);
    }

    sql += " ORDER BY UseCount DESC";
    sql += " LIMIT ?";
    params.push(options.limit ?? 25);

    const rows = db.prepare(sql).all(...params) as Array<{
      ResourceId: string;
      Title: string;
      AbbreviatedTitle: string | null;
      Type: string;
      Authors: string | null;
      Subjects: string | null;
      Description: string | null;
      PublicationDate: string | null;
    }>;

    return rows.map((r) => ({
      resourceId: r.ResourceId,
      title: r.Title,
      abbreviatedTitle: r.AbbreviatedTitle,
      type: r.Type,
      authors: r.Authors,
      subjects: r.Subjects,
      description: stripXml(r.Description),
      publicationDate: r.PublicationDate,
    }));
  } finally {
    db.close();
  }
}

// ─── Resource Type Summary ──────────────────────────────────────────────────

export function getResourceTypeSummary(): ResourceTypeSummary[] {
  const db = openDb(DB_PATHS.catalog);
  try {
    const rows = db.prepare(`
      SELECT Type, COUNT(*) as Count
      FROM Records
      WHERE Availability >= 1 AND IsDataset = 0
      GROUP BY Type
      ORDER BY Count DESC
    `).all() as Array<{
      Type: string;
      Count: number;
    }>;

    // Collapse types that share the same human-readable label
    const merged = new Map<string, number>();
    for (const r of rows) {
      const label = typeLabel(r.Type);
      merged.set(label, (merged.get(label) ?? 0) + r.Count);
    }
    return Array.from(merged.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  } finally {
    db.close();
  }
}

// ─── Installed Bible Translations ───────────────────────────────────────────

// Locally installed Bible translations, identified by catalog Type
// "text.monograph.bible" (verified against the local catalog; no other Type
// string was found to represent Bible text resources there).
export function getInstalledBibles(query?: string): LocalBibleInfo[] {
  const db = openCatalogDbSafely();
  try {
    let sql = `
      SELECT ResourceId, Title, AbbreviatedTitle, Languages, Publishers
      FROM Records
      WHERE Type = 'text.monograph.bible' AND Availability >= 1 AND IsDataset = 0
    `;
    const params: unknown[] = [];

    if (query) {
      sql += " AND (Title LIKE ? OR AbbreviatedTitle LIKE ? OR Languages LIKE ?)";
      const q = `%${query}%`;
      params.push(q, q, q);
    }

    sql += " ORDER BY Title ASC";

    let rows: Array<{
      ResourceId: string;
      Title: string;
      AbbreviatedTitle: string | null;
      Languages: string | null;
      Publishers: string | null;
    }>;
    try {
      rows = db.prepare(sql).all(...params) as typeof rows;
    } catch (e) {
      // better-sqlite3 defers file-format validation to the first statement
      // (opening a non-database file does not throw), so we distinguish
      // "not a valid database" from "schema doesn't match" here, by code.
      const code = (e as { code?: string } | undefined)?.code;
      if (code === "SQLITE_NOTADB" || code === "SQLITE_CORRUPT") {
        throw new Error(
          "Logos library catalog could not be read. It may be corrupted, or locked by another process (e.g. Logos is currently syncing)."
        );
      }
      throw new Error(
        "Logos library catalog has an unexpected structure for this Logos version (expected table/columns not found). This tool may need to be updated."
      );
    }

    return rows.map((r) => ({
      resourceId: r.ResourceId,
      title: r.Title,
      abbreviatedTitle: r.AbbreviatedTitle,
      languages: splitDelimited(r.Languages),
      publishers: splitDelimited(r.Publishers),
    }));
  } finally {
    db.close();
  }
}

// ─── Resource Titles (batch lookup) ─────────────────────────────────────────

// Looks up catalog titles for a batch of resource IDs at once (avoids N+1
// catalog queries when a caller has a list of LLS: IDs to display, e.g. a
// collection's members). IDs with no matching catalog entry are simply
// absent from the returned map — callers decide their own fallback.
export function getResourceTitles(resourceIds: string[]): Map<string, string> {
  if (resourceIds.length === 0) return new Map();

  const db = openDb(DB_PATHS.catalog);
  try {
    const placeholders = resourceIds.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT ResourceId, Title FROM Records WHERE ResourceId IN (${placeholders})`)
      .all(...resourceIds) as Array<{ ResourceId: string; Title: string }>;

    return new Map(rows.map((r) => [r.ResourceId, r.Title]));
  } finally {
    db.close();
  }
}
