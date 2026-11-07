/**
 * LINE TV Taiwan official notice: user-supplied text importer.
 * Does not fetch, crawl, mirror, or republish the official help-center page.
 * Parsing is NOT verification. Every selected record needs explicit human review.
 */
export const LINE_TV_TW_SOURCE_URL =
  "https://help.linetv.tw/hc/zh-tw/articles/56415479134873-即將下架影片清單-台灣";
export const LINE_TV_PROVIDER_ID = "line";

export interface LineTvNoticeRow {
  title: string;
  category: string;
  expiresOn: string; // Taiwan local calendar day, inclusive until 23:59
  sourceUrl: string;
  rowNumber: number;
}
export interface LineTvParseResult {
  rows: LineTvNoticeRow[];
  rejected: { rowNumber: number; reason: string }[];
  duplicates: number;
  sourceUrl: string;
}
export interface TrackedTitleIdentity {
  tmdbId: number;
  title: string;
  originalTitle?: string;
}
export type MatchSuggestion =
  | { status: "EXACT"; tmdbId: number }
  | { status: "AMBIGUOUS"; tmdbIds: number[] }
  | { status: "NO_EXACT_MATCH" };

export function validateLineTvTwUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("請提供LINE TV台灣官方公告網址");
  }
  if (url.protocol !== "https:" || url.hostname !== "help.linetv.tw" ||
    url.port || url.username || url.password ||
    !/^\/hc\/zh-tw\/articles\/56415479134873(?:-|$)/.test(url.pathname)) {
    throw new Error("此匯入器只支援LINE TV台灣官方下架公告");
  }
  // Discard trackers and fragments before persisting individual citations.
  url.search = "";
  url.hash = "";
  return url.toString();
}
export function normalizeOfficialTitle(input: string): string {
  return input.normalize("NFKC").toLocaleLowerCase("zh-TW")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}
function parseCalendarDate(raw: string): string | null {
  const match = /^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw.trim());
  if (!match) return null;
  const [, yr, mo, day] = match;
  const normalized = [yr, mo.padStart(2, "0"), day.padStart(2, "0")].join("-");
  const time = Date.parse(normalized + "T00:00:00.000Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === normalized
    ? normalized : null;
}
function rowCells(line: string): string[] {
  // Official table text, Markdown pipe tables, and TSV pastes.
  if (line.includes("|")) return line.split("|").map(v => v.trim()).filter(Boolean);
  if (line.includes("\t")) return line.split(/\t+/).map(v => v.trim()).filter(Boolean);
  return [];
}
function parseNoticeLine(line: string): {
  title: string; category: string; dateText: string;
} | null {
  const cells = rowCells(line);
  const datePattern = /20\d{2}[-/]\d{1,2}[-/]\d{1,2}/g;
  if (cells.length >= 2) {
    const hits = cells.flatMap((cell, index) =>
      datePattern.test(cell) ? [{ index, cell }] : []);
    if (hits.length !== 1) return null;
    const hit = hits[0];
    const dateText = hit.cell.match(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}/)?.[0] ?? "";
    let title = "", category = "";
    if (cells.length === 2) {
      title = cells[hit.index === 0 ? 1 : 0];
    } else {
      category = cells[0];
      title = cells[hit.index === 1 ? 2 : 1];
    }
    if (!title || !dateText) return null;
    return { title, category, dateText };
  }
  // Flattened plain-text copy: "電影VIP  作品片名  2026/11/7".
  // The only safe automatic split is a recognized category prefix.
  const flattened = /^(.*?)\s+(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\s*$/.exec(line);
  if (!flattened) return null;
  const left = flattened[1].trim();
  const category = /^(?:電影|戲劇|綜藝|親子|動畫|短劇|VIP)[^\s]{0,12}(?=\s)/.exec(left)?.[0] ?? "";
  const title = category ? left.slice(category.length).trim() : left;
  return title ? { title, category, dateText: flattened[2] } : null;
}
export function parseLineTvTaiwanNotice(
  rawText: string,
  rawSourceUrl: string = LINE_TV_TW_SOURCE_URL,
): LineTvParseResult {
  const sourceUrl = validateLineTvTwUrl(rawSourceUrl);
  if (!rawText.trim()) throw new Error("請貼上官方清單內容");
  if (rawText.length > 40_000) throw new Error("單次匯入文字上限為40,000字元");
  const lines = rawText.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 700) throw new Error("貼上的清單超過700行，請分批研究");
  const rows: LineTvNoticeRow[] = [];
  const rejected: LineTvParseResult["rejected"] = [];
  let duplicates = 0;
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || /^(?:[#>-]|\|?[\s:|-]+\|?$)/.test(line)) continue;
    const candidate = parseNoticeLine(line);
    if (!candidate) continue;
    const date = parseCalendarDate(candidate.dateText);
    const title = candidate.title.trim();
    if (!date || !title || title.length > 200) {
      rejected.push({ rowNumber: i + 1, reason: "日期或片名不合法" });
      continue;
    }
    const key = normalizeOfficialTitle(title) + "::" + date;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    rows.push({
      title, category: candidate.category,
      expiresOn: date, sourceUrl, rowNumber: i + 1,
    });
    if (rows.length >= 250) break;
  }
  return { rows, rejected, duplicates, sourceUrl };
}
/** Suggestions only. Never accept a title match or a deadline without user approval. */
export function suggestExactTrackedMatch(
  row: LineTvNoticeRow,
  tracked: TrackedTitleIdentity[],
): MatchSuggestion {
  const key = normalizeOfficialTitle(row.title);
  if (!key) return { status: "NO_EXACT_MATCH" };
  const matches = tracked.filter(item =>
    [item.title, item.originalTitle].some(value => value &&
      normalizeOfficialTitle(value) === key));
  if (matches.length === 1) return { status: "EXACT", tmdbId: matches[0].tmdbId };
  if (matches.length > 1) return {
    status: "AMBIGUOUS", tmdbIds: matches.map(item => item.tmdbId),
  };
  return { status: "NO_EXACT_MATCH" };
}
export function isNoticeUpcoming(expiresOn: string, currentTaiwanDay: string): boolean {
  if (!parseCalendarDate(expiresOn) || !parseCalendarDate(currentTaiwanDay)) {
    throw new Error("無效的台灣日期");
  }
  return expiresOn >= currentTaiwanDay;
}
