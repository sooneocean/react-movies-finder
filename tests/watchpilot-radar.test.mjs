import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveRadarEvents, validateReviewedNotice, trimRadarSnapshots,
} from "../src/lib/watchpilot/catalog-radar.ts";
import {
  emptyRadarWorkspace, upsertTrackedTitle, removeTrackedTitle, recordRadarRefreshFailure,
  upsertReviewedNotice, radarSnapshotFromTitle, withReviewedExpiry,
  loadRadarWorkspace, saveRadarWorkspace, RADAR_STORAGE_KEY,
} from "../src/lib/watchpilot/radar-workspace.ts";
import { normalizeTWMovie } from "../src/lib/watchpilot/tmdb-tw.ts";
import { planViewing } from "../src/lib/watchpilot/engine.ts";

const offer = (providerId = "netflix", access = "subscription") =>
  ({ providerId, providerName: providerId, access });
const when = (date) => new Date(date).toISOString();
const base = (date, offers = [offer()], status = "SUCCESS") => ({
  workId: "tmdb:42", workTitle: "研究用影片", region: "TW", source: "TMDB_JUSTWATCH",
  observedAt: when(date), status, offers,
});
const kinds = rows => deriveRadarEvents(rows).map(item => item.kind);
test("first successful observation is a baseline, not newly released", () => {
  assert.deepEqual(kinds([base("2026-11-01T00:00:00Z")]), ["BASELINE"]);
});
test("a previously absent provider becomes newly observed, not officially released", () => {
  const rows = [
    base("2026-11-01T00:00:00Z", []),
    base("2026-11-02T00:00:00Z", [offer()]),
  ];
  assert.deepEqual(kinds(rows), ["BASELINE", "NEWLY_OBSERVED"]);
});
test("subscription changing to rental is an access change, not two fake in/out events", () => {
  const rows = [
    base("2026-11-01T00:00:00Z", [offer()]),
    base("2026-11-02T00:00:00Z", [offer("netflix", "rent")]),
  ];
  const events = deriveRadarEvents(rows);
  assert.deepEqual(events.map(x => x.kind), ["BASELINE", "ACCESS_CHANGED"]);
  assert.deepEqual(events[1].fromAccess, ["subscription"]);
  assert.deepEqual(events[1].toAccess, ["rent"]);
});
test("first absence is never a confirmed removal", () => {
  const rows = [
    base("2026-11-01T00:00:00Z"),
    base("2026-11-02T00:00:00Z", []),
  ];
  const events = deriveRadarEvents(rows);
  assert.equal(events[1].kind, "MISSING_FIRST");
  assert.equal(events[1].confidence, "OBSERVED");
});
test("repeated absence requires 24h, triggers only once in the streak", () => {
  const rows = [
    base("2026-11-01T00:00:00Z"),
    base("2026-11-02T00:00:00Z", []),
    base("2026-11-02T23:00:00Z", []),
    base("2026-11-03T00:00:00Z", []),
    base("2026-11-04T00:00:00Z", []),
  ];
  assert.deepEqual(kinds(rows), ["BASELINE", "MISSING_FIRST", "MISSING_REPEATED"]);
});
test("source error is never an observed removal and breaks repeated-absence evidence chain", () => {
  const rows = [
    base("2026-11-01T00:00:00Z"),
    base("2026-11-02T00:00:00Z", []),
    base("2026-11-03T00:00:00Z", [], "FAILED"),
    base("2026-11-04T00:00:00Z", []),
    base("2026-11-05T00:00:00Z", []),
  ];
  assert.deepEqual(kinds(rows), ["BASELINE", "MISSING_FIRST", "SOURCE_FAILED", "MISSING_REPEATED"]);
  // Repeat is based on fresh observations from Nov 4 and Nov 5,
  // not from the interrupted Nov 2 -> Nov 3 chain.
});
test("partial source is not a delisting", () => {
  assert.deepEqual(kinds([
    base("2026-11-01T00:00:00Z"),
    base("2026-11-02T00:00:00Z", [], "PARTIAL"),
  ]), ["BASELINE", "SOURCE_PARTIAL"]);
});
test("returning source is observed as returned, not a new release", () => {
  const rows = [
    base("2026-11-01T00:00:00Z"),
    base("2026-11-02T00:00:00Z", []),
    base("2026-11-04T00:00:00Z", [offer()]),
  ];
  assert.deepEqual(kinds(rows), ["BASELINE", "MISSING_FIRST", "RETURNED_OBSERVED"]);
});
test("duplicate timestamp, mixed work, mixed sources, and failed-with-offers are rejected", () => {
  const a = base("2026-11-01T00:00:00Z");
  assert.throws(() => deriveRadarEvents([a, a]));
  assert.throws(() => deriveRadarEvents([a, { ...a, observedAt: when("2026-11-02T00:00:00Z"), workId: "tmdb:43" }]));
  assert.throws(() => deriveRadarEvents([a, { ...a, observedAt: when("2026-11-02T00:00:00Z"), source: "FIXTURE" }]));
  assert.throws(() => deriveRadarEvents([a, base("2026-11-03T00:00:00Z", [offer()], "FAILED")]));
});
test("event stream is order-independent when snapshots are valid", () => {
  const rows = [base("2026-11-01T00:00:00Z"),
    base("2026-11-02T00:00:00Z", [])];
  assert.deepEqual(deriveRadarEvents(rows), deriveRadarEvents([...rows].reverse()));
});
test("30-day retention and 20-snapshot cap are deterministic", () => {
  const rows = Array.from({ length: 32 }, (_, i) => base(
    when(Date.UTC(2026, 9, 31 + i)), []));
  const kept = trimRadarSnapshots(rows, new Date("2026-12-02T00:00:00Z"));
  assert.ok(kept.length <= 20);
  assert.ok(kept.every(x => Date.parse(x.observedAt) >= Date.parse("2026-11-02T00:00:00Z")));
});
const notice = {
  workId: "tmdb:42", providerId: "netflix",
  expiresOn: "2026-11-10",
  sourceUrl: "https://www.netflix.com/tw/",
  checkedAt: "2026-11-07T00:00:00Z", reviewedByUser: true,
};
test("manual expiry requires user review, valid date and HTTPS evidence", () => {
  assert.equal(validateReviewedNotice(notice).expiresOn, "2026-11-10");
  assert.throws(() => validateReviewedNotice({ ...notice, reviewedByUser: false }));
  assert.throws(() => validateReviewedNotice({ ...notice, expiresOn: "2026-02-30" }));
  assert.throws(() => validateReviewedNotice({ ...notice, sourceUrl: "http://example.com" }));
  assert.throws(() => validateReviewedNotice({ ...notice, sourceUrl: "https://user:pw@example.com" }));
});
function title(whenISO = "2026-11-07T00:00:00Z") {
  return normalizeTWMovie({
    id: 42, title: "研究用影片", runtime: 100, genres: [{ id: 878, name: "科幻" }],
    vote_average: 8.0, vote_count: 100,
  }, { results: { TW: { flatrate: [{ provider_id: 8, provider_name: "Netflix" }] } } }, whenISO);
}
test("manual evidence never promotes TMDB availability from OBSERVED to VERIFIED", () => {
  const item = title();
  const updated = withReviewedExpiry([item], [notice]);
  assert.equal(updated[0].offers[0].evidence, "OBSERVED");
  assert.equal(updated[0].offers[0].expiryEvidence, "USER_REVIEWED_OFFICIAL");
  assert.equal(updated[0].offers[0].expiresOn, "2026-11-10");
});
test("reviewed official date blocks schedules beyond expiry, while unreviewed data does not", () => {
  const basic = title();
  const withDeadline = withReviewedExpiry([basic], [notice])[0];
  const makeInput = (candidate, startDate) => ({
    mode: "research", region: "TW", subscribedProviders: ["netflix"], excludedGenres: [],
    slots: [{ date: startDate, minutes: 150 }], weeklyBudgetMinutes: 150,
    candidates: [{
      id: "tmdb:42", title: candidate.title, runtimeMinutes: 100,
      genres: ["science-fiction"], tasteScore: 80, qualityScore: 80,
      offers: candidate.offers,
    }],
    observationMaxAgeDays: 7,
  });
  const date = "2026-11-12";
  assert.equal(planViewing(makeInput(basic, date)).items.length, 1);
  assert.equal(planViewing(makeInput(withDeadline, date)).items.length, 0);
});
test("track one title twice with same observation timestamp does not duplicate baseline", () => {
  const initial = emptyRadarWorkspace();
  const first = upsertTrackedTitle(initial, title(), new Date("2026-11-08T00:00:00Z"));
  const second = upsertTrackedTitle(first, title(), new Date("2026-11-08T00:00:00Z"));
  assert.equal(second.snapshots.length, 1);
  assert.equal(second.tracked.length, 1);
  assert.deepEqual(kinds(second.snapshots), ["BASELINE"]);
  assert.equal(radarSnapshotFromTitle(title()).offers[0].access, "subscription");
});
test("notices attach only to tracked works and removal cleans related state", () => {
  const initial = upsertTrackedTitle(emptyRadarWorkspace(), title(), new Date("2026-11-08T00:00:00Z"));
  const withNotice = upsertReviewedNotice(initial, notice);
  assert.equal(withNotice.reviewedNotices.length, 1);
  const removed = removeTrackedTitle(withNotice, 42);
  assert.deepEqual(removed.tracked, []);
  assert.deepEqual(removed.reviewedNotices, []);
  assert.deepEqual(removed.snapshots, []);
});
test("workspace remains local, bounded, and recovers from malformed persisted state", () => {
  const memory = new Map();
  const store = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  const original = upsertTrackedTitle(emptyRadarWorkspace(), title(), new Date("2026-11-08T00:00:00Z"));
  saveRadarWorkspace(store, original);
  const restored = loadRadarWorkspace(store, new Date("2026-11-08T00:00:00Z"));
  assert.equal(restored.tracked[0].tmdbId, 42);
  assert.equal(restored.snapshots.length, 1);
  assert.ok(memory.has(RADAR_STORAGE_KEY));
  store.setItem(RADAR_STORAGE_KEY, "{broken");
  assert.deepEqual(loadRadarWorkspace(store), emptyRadarWorkspace());
});

test("failed refresh is auditable and cannot imply removal", () => {
  const initial = upsertTrackedTitle(emptyRadarWorkspace(), title(), new Date("2026-11-08T00:00:00Z"));
  const failed = recordRadarRefreshFailure(initial, 42, new Date("2026-11-09T00:00:00Z"));
  assert.equal(failed.tracked[0].offers.length, 1);
  assert.deepEqual(kinds(failed.snapshots), ["BASELINE", "SOURCE_FAILED"]);
  assert.equal(failed.snapshots[1].offers.length, 0);
  assert.equal(failed.snapshots[1].status, "FAILED");
});

test("first successful observation after a failure cannot claim repeated absence", () => {
  const rows = [
    base("2026-11-01T00:00:00Z"),
    base("2026-11-02T00:00:00Z", []),
    base("2026-11-03T00:00:00Z", [], "FAILED"),
    base("2026-11-04T00:00:00Z", []),
  ];
  assert.deepEqual(kinds(rows), ["BASELINE", "MISSING_FIRST", "SOURCE_FAILED"]);
});
