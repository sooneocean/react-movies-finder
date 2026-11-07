import assert from "node:assert/strict";
import { test } from "node:test";
import { planViewing } from "../src/lib/watchpilot/engine.ts";

const official = (expiresOn = null) => ({
  providerId: "netflix", region: "TW", access: "subscription",
  evidence: "VERIFIED", source: "test://official", observedOn: "2026-11-07", expiresOn,
});
const fixture = (expiresOn = null) => ({
  ...official(expiresOn), evidence: "FIXTURE", source: "fixture://sample",
});
const movie = (id, offers = [official()], runtimeMinutes = 100, genres = ["drama"]) => ({
  id, title: id, runtimeMinutes, genres,
  tasteScore: 90, qualityScore: 80, offers,
});
const input = (candidates, extra = {}) => ({
  mode: "research", region: "TW", subscribedProviders: ["netflix"],
  excludedGenres: [], slots: [
    { date: "2026-11-07", minutes: 150 },
    { date: "2026-11-08", minutes: 120 },
  ], candidates, ...extra,
});

test("valid verified TW offers fit daily slot budgets", () => {
  const result = planViewing(input([movie("a"), movie("b"), movie("c")]));
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map(x => x.date), ["2026-11-07", "2026-11-08"]);
  assert.ok(result.scheduledMinutes <= result.requestedMinutes);
});
test("unverified source never masquerades as confirmed availability", () => {
  const result = planViewing(input([movie("x", [{ ...official(), evidence: "UNVERIFIED" }])]));
  assert.equal(result.items.length, 0);
  assert.equal(result.rejections[0].reason, "no_eligible_offer");
});
test("fixture and research data are mutually isolated", () => {
  assert.equal(planViewing(input([movie("x", [fixture()])])).items.length, 0);
  assert.equal(planViewing(input([movie("x", [fixture()])], { mode: "fixture" })).items[0].evidence, "FIXTURE");
  assert.equal(planViewing(input([movie("x", [official()])], { mode: "fixture" })).items.length, 0);
});
test("official expiry is inclusive and blocks subsequent dates", () => {
  assert.equal(planViewing(input([movie("x", [official("2026-11-07")])],
    { slots: [{ date: "2026-11-07", minutes: 120 }] })).items.length, 1);
  assert.equal(planViewing(input([movie("x", [official("2026-11-07")])],
    { slots: [{ date: "2026-11-08", minutes: 120 }] })).items.length, 0);
});
test("unverified expiry never turns into confirmed countdown", () => {
  const result = planViewing(input([movie("x", [{
    ...official("2026-11-07"), evidence: "OBSERVED",
  }])], { slots: [{ date: "2026-11-08", minutes: 120 }] }));
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].confirmedExpiryOn, null);
});
test("excluded genres and watched movies are rejected", () => {
  const result = planViewing(input([
    movie("h", [official()], 80, ["horror"]), { ...movie("w"), watched: true },
  ], { excludedGenres: ["horror"] }));
  assert.equal(result.items.length, 0);
  assert.deepEqual(new Set(result.rejections.map(x => x.reason)),
    new Set(["excluded_genre", "already_watched"]));
});
test("rent and buy offers are not subscription entitlement", () => {
  const result = planViewing(input([
    movie("r", [{ ...official(), access: "rent" }]),
    movie("b", [{ ...official(), access: "buy" }]),
  ]));
  assert.equal(result.items.length, 0);
});
test("different region or unsubscribed service is excluded", () => {
  const result = planViewing(input([movie("x", [
    { ...official(), region: "US" }, { ...official(), providerId: "prime" },
  ])]));
  assert.equal(result.items.length, 0);
});
test("stale observed source is not treated as current", () => {
  const result = planViewing(input([movie("x", [{
    ...official(), evidence: "OBSERVED", observedOn: "2026-10-01",
  }])]));
  assert.equal(result.items.length, 0);
});
test("invalid runtimes, scores, duplicated ids and slot minutes fail safely", () => {
  assert.equal(planViewing(input([movie("x", [official()], -1)])).items.length, 0);
  assert.equal(planViewing(input([{ ...movie("x"), tasteScore: 101 }])).items.length, 0);
  assert.throws(() => planViewing(input([movie("x"), movie("x")])));
  assert.throws(() => planViewing(input([movie("x")],
    { slots: [{ date: "2026-11-07", minutes: -1 }] })));
});
test("malformed calendar dates are rejected", () => {
  assert.throws(() => planViewing(input([], { slots: [{ date: "2026-02-30", minutes: 100 }] })));
});
test("same input produces byte-identical deterministic results", () => {
  const data = input([movie("a"), movie("b")]);
  assert.deepEqual(planViewing(data), planViewing(data));
});
