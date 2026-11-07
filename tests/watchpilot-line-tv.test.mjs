import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LINE_TV_TW_SOURCE_URL, LINE_TV_PROVIDER_ID,
  validateLineTvTwUrl, normalizeOfficialTitle, parseLineTvTaiwanNotice,
  suggestExactTrackedMatch, isNoticeUpcoming,
} from "../src/lib/watchpilot/line-tv-official.ts";
import {
  emptyRadarWorkspace, upsertTrackedTitle, upsertReviewedNotice, withReviewedExpiry,
} from "../src/lib/watchpilot/radar-workspace.ts";
import { normalizeTWMovie } from "../src/lib/watchpilot/tmdb-tw.ts";

const url = LINE_TV_TW_SOURCE_URL;
test("allows only LINE TV official Taiwan help article and strips trackers", () => {
  assert.ok(validateLineTvTwUrl(url).startsWith("https://help.linetv.tw/hc/zh-tw/articles/56415479134873-"));
  const tracked = validateLineTvTwUrl(url + "?utm_source=abc#x");
  assert.ok(!tracked.includes("utm_source") && !tracked.includes("#"));
});
test("rejects non-Taiwan articles, lookalike hosts, bad scheme and credentials", () => {
  for (const link of [
    "https://help.linetv.tw/hc/zh-tw/articles/56415461735449-即將下架影片清單-中國",
    "https://help.linetv.tw.evil.example/hc/zh-tw/articles/56415479134873-foo",
    "http://help.linetv.tw/hc/zh-tw/articles/56415479134873-foo",
    "https://user:secret@help.linetv.tw/hc/zh-tw/articles/56415479134873-foo",
  ]) assert.throws(() => validateLineTvTwUrl(link));
});
test("parses title-date table order and both ISO/slash dates", () => {
  const data = [
    "類別 | 影片名稱 | 預計下架日",
    "電影 | 研究電影甲 | 2026-11-09",
    "電影VIP | 研究電影乙 | 2026/11/12",
  ].join("\n");
  const result = parseLineTvTaiwanNotice(data);
  assert.deepEqual(result.rows.map(x => x.expiresOn), ["2026-11-09", "2026-11-12"]);
  assert.equal(result.rows[0].title, "研究電影甲");
  assert.equal(result.rows[0].category, "電影");
  assert.equal(result.rows[1].category, "電影VIP");
});
test("parses date-title table order from official archived layouts", () => {
  const raw = [
    "類別 | 預計下架日 | 影片名稱",
    "戲劇 | 2026/11/8 | 虛構戲劇甲",
    "電影 | 2026-11-10 | 虛構電影乙",
  ].join("\n");
  const result = parseLineTvTaiwanNotice(raw);
  assert.deepEqual(result.rows.map(x => x.title), ["虛構戲劇甲", "虛構電影乙"]);
  assert.equal(result.rows.length, 2);
});
test("no stateful regexp bug when parsing consecutive rows", () => {
  const raw = [
    "電影 | 虛構A | 2026-11-08",
    "電影 | 虛構B | 2026-11-09",
    "電影 | 虛構C | 2026-11-10",
    "電影 | 虛構D | 2026-11-11",
  ].join("\n");
  assert.equal(parseLineTvTaiwanNotice(raw).rows.length, 4);
});
test("accepts tab-separated rows and flattened plain text", () => {
  const raw = [
    "電影\t虛構電影丙\t2026/11/17",
    "戲劇  研究劇集丁  2026-11-18",
  ].join("\n");
  const result = parseLineTvTaiwanNotice(raw);
  assert.deepEqual(result.rows.map(x => x.title), ["虛構電影丙", "研究劇集丁"]);
});
test("de-duplicates identical entries without merging conflicting expiry days", () => {
  const raw = [
    "電影 | 研究電影甲 | 2026-11-09",
    "電影 | 研究電影甲 | 2026/11/9",
    "電影 | 研究電影甲 | 2026-11-11",
  ].join("\n");
  const result = parseLineTvTaiwanNotice(raw);
  assert.equal(result.rows.length, 2);
  assert.equal(result.duplicates, 1);
});
test("invalid calendar dates never produce importable notices", () => {
  const result = parseLineTvTaiwanNotice([
    "電影 | 有效片名 | 2026-11-20",
    "電影 | 錯誤片名 | 2026/02/30",
  ].join("\n"));
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rejected.map(x => x.rowNumber), [2]);
});
test("empty, oversized, or excessive-line input fails safely", () => {
  assert.throws(() => parseLineTvTaiwanNotice(""));
  assert.throws(() => parseLineTvTaiwanNotice("x".repeat(40001)));
  assert.throws(() => parseLineTvTaiwanNotice(Array(702).fill("x").join("\n")));
});
test("NFKC punctuation and whitespace help exact title suggestions", () => {
  assert.equal(normalizeOfficialTitle("《星 際：效 應》"), normalizeOfficialTitle("星際效應"));
  const row = parseLineTvTaiwanNotice("電影 | 《星際：效應》 | 2026-11-25").rows[0];
  const match = suggestExactTrackedMatch(row, [
    { tmdbId: 1, title: "星際效應" },
    { tmdbId: 2, title: "其他電影" },
  ]);
  assert.deepEqual(match, { status: "EXACT", tmdbId: 1 });
});
test("ambiguous title match is never silently resolved", () => {
  const row = parseLineTvTaiwanNotice("電影 | 同名電影 | 2026-11-25").rows[0];
  const match = suggestExactTrackedMatch(row, [
    { tmdbId: 1, title: "同名電影" }, { tmdbId: 2, title: "同名電影" },
  ]);
  assert.equal(match.status, "AMBIGUOUS");
  assert.deepEqual(match.tmdbIds, [1,2]);
});
test("no exact title match remains unassigned", () => {
  const row = parseLineTvTaiwanNotice("電影 | 不是同一部片 | 2026-11-25").rows[0];
  assert.equal(suggestExactTrackedMatch(row, [{ tmdbId: 33, title: "另一部片" }]).status, "NO_EXACT_MATCH");
});
test("inclusive Taiwan calendar day handles today and next day", () => {
  assert.equal(isNoticeUpcoming("2026-11-07", "2026-11-07"), true);
  assert.equal(isNoticeUpcoming("2026-11-06", "2026-11-07"), false);
  assert.equal(isNoticeUpcoming("2026-11-08", "2026-11-07"), true);
  assert.throws(() => isNoticeUpcoming("2026-02-30", "2026-11-07"));
});
test("reviewed official deadline remains separate from third-party TW observation", () => {
  const title = normalizeTWMovie({
    id: 42, title: "研究電影甲", runtime: 105, genres: [], vote_average: 8, vote_count: 100,
  }, { results: { TW: { flatrate: [{ provider_id: 999, provider_name: "LINE TV" }] } } },
  "2026-11-07T00:00:00Z");
  // A verified provider-name mapping is allowed, but availability stays observed.
  assert.ok(title.offers.every(x => x.evidence === "OBSERVED"));
  assert.equal(title.offers[0].providerId, LINE_TV_PROVIDER_ID);
  const workspace = upsertTrackedTitle(emptyRadarWorkspace(), title,
    new Date("2026-11-07T01:00:00Z"));
  const reviewed = upsertReviewedNotice(workspace, {
    workId: "tmdb:42", providerId: LINE_TV_PROVIDER_ID,
    expiresOn: "2026-11-25", sourceUrl: url,
    checkedAt: "2026-11-07T02:00:00Z", reviewedByUser: true,
  });
  assert.equal(reviewed.reviewedNotices.length, 1);
  const projected = withReviewedExpiry(reviewed.tracked, reviewed.reviewedNotices);
  assert.equal(projected[0].offers[0].evidence, "OBSERVED");
  assert.equal(projected[0].offers[0].expiresOn, "2026-11-25");
  assert.equal(projected[0].offers[0].expiryEvidence, "USER_REVIEWED_OFFICIAL");
});

test("reviewed LINE TV expiry never creates a non-existent LINE TV offer", () => {
  const title = normalizeTWMovie({
    id: 99, title: "沒有LINE TV觀測資料的影片", runtime: 110,
    genres: [], vote_average: 8, vote_count: 100,
  }, { results: { TW: { flatrate: [
    { provider_id: 8, provider_name: "Netflix" },
  ] } } }, "2026-11-07T00:00:00Z");
  const saved = upsertReviewedNotice(
    upsertTrackedTitle(emptyRadarWorkspace(), title, new Date("2026-11-07T01:00:00Z")),
    {
      workId: "tmdb:99", providerId: LINE_TV_PROVIDER_ID,
      expiresOn: "2026-11-25", sourceUrl: LINE_TV_TW_SOURCE_URL,
      checkedAt: "2026-11-07T02:00:00Z", reviewedByUser: true,
    },
  );
  const projected = withReviewedExpiry(saved.tracked, saved.reviewedNotices);
  assert.equal(projected[0].offers.length, 1);
  assert.equal(projected[0].offers[0].providerId, "netflix");
  assert.equal(projected[0].offers[0].expiresOn, null);
});
