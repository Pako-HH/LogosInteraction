import { BIBLIA_API_KEY, BIBLIA_API_BASE, DEFAULT_BIBLE } from "../config.js";
import type { BibleTextResult, BibleSearchResult, BibleSearchHit } from "../types.js";

const BIBLIA_TIMEOUT_MS = 10_000;

async function bibliaFetch(path: string, params: Record<string, string>): Promise<unknown> {
  if (!BIBLIA_API_KEY) {
    throw new Error("BIBLIA_API_KEY is not set. Get a free key at https://bibliaapi.com");
  }

  const url = new URL(`${BIBLIA_API_BASE}${path}`);
  url.searchParams.set("key", BIBLIA_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BIBLIA_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `Biblia API request timed out after ${BIBLIA_TIMEOUT_MS / 1000}s: ${path}`
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Biblia API request failed: ${msg}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Biblia API error ${res.status}: ${body}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

export async function getBibleText(
  passage: string,
  bible: string = DEFAULT_BIBLE
): Promise<BibleTextResult> {
  const text = await bibliaFetch(`/content/${bible}.txt`, { passage });
  return {
    passage,
    text: String(text).trim(),
    bible,
  };
}

export async function searchBible(
  query: string,
  options: { bible?: string; limit?: number; mode?: string } = {}
): Promise<BibleSearchResult> {
  const bible = options.bible ?? DEFAULT_BIBLE;
  const data = await bibliaFetch(`/search/${bible}`, {
    query,
    mode: options.mode ?? "verse",
    limit: String(options.limit ?? 20),
  }) as { resultCount: number; results: Array<{ title: string; preview: string }> };

  return {
    query,
    resultCount: data.resultCount ?? 0,
    results: (data.results ?? []).map((r): BibleSearchHit => ({
      title: r.title ?? "",
      preview: r.preview ?? "",
    })),
  };
}
