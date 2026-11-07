import assert from "node:assert/strict";
import { test } from "node:test";
import { makeLabInput, parsePreferenceHint } from "../src/lib/watchpilot/fixtures.ts";
import { planViewing } from "../src/lib/watchpilot/engine.ts";

const base = {
  startDate: "2026-11-07", weeklyMinutes: 360,
  subscribedProviders: ["netflix", "disney"],
  text: "想看科幻懸疑，不要恐怖片",
};
test("Chinese keyword parser separates positive and negative genres", () => {
  const result = parsePreferenceHint(base.text);
  assert.deepEqual(result.preferredGenres, ["science-fiction", "mystery"]);
  assert.deepEqual(result.excludedGenres, ["horror"]);
});
test("generated samples are unambiguously fixture-only", () => {
  const plan = makeLabInput(base);
  assert.equal(plan.mode, "fixture");
  assert.ok(plan.candidates.every(x => x.offers.every(
    o => o.evidence === "FIXTURE" && o.source.startsWith("fixture://"))));
});
test("week budget is respected, including very small budgets", () => {
  const p = planViewing(makeLabInput(base));
  assert.ok(p.scheduledMinutes <= 360);
  const small = planViewing(makeLabInput({ ...base, weeklyMinutes: 60 }));
  assert.equal(small.scheduledMinutes, 0);
});
test("choosing no subscription providers never schedules subscription-only titles", () => {
  const result = planViewing(makeLabInput({ ...base, subscribedProviders: [] }));
  assert.equal(result.items.length, 0);
});
test("fixture plan never schedules explicitly excluded horror title", () => {
  const result = planViewing(makeLabInput(base));
  assert.ok(!result.items.some(x => x.movieId === "sample-05"));
});
