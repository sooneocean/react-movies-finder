import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeTWMovie } from "../src/lib/watchpilot/tmdb-tw.ts";
import { generateTWResearchPlan } from "../src/lib/watchpilot/research-plan.ts";
import { emptyTastePassport, setGenrePreference, rateTasteWork } from "../src/lib/watchpilot/taste-passport.ts";

const now = "2026-11-07T10:00:00.000Z";
const base = {
  startDate: "2026-11-07", weeklyMinutes: 240, dailyMinutes: 150,
  subscribedProviders: ["netflix"],
  preferenceText: "喜歡科幻，不要恐怖片",
};
function title(id, providerId = 8, genres = [{ id: 878, name: "科幻" }]) {
  return normalizeTWMovie({
    id, title: "研究影片" + id, runtime: 110, genres,
    vote_average: 8, vote_count: 100,
  }, { results: { TW: {
    flatrate: [{ provider_id: providerId, provider_name: providerId === 8 ? "Netflix" : "Disney Plus" }],
  } } }, now);
}
test("Two verified-fresh observed offers fill two slots, under global weekly budget", () => {
  const result = generateTWResearchPlan([title(1), title(2), title(3)], base);
  assert.equal(result.plan.items.length, 2);
  assert.equal(result.plan.scheduledMinutes, 220);
  assert.equal(result.plan.requestedMinutes, 240);
  assert.ok(result.plan.items.every(item => item.evidence === "OBSERVED" &&
    item.confirmedExpiryOn === null));
});
test("Unsubscribed providers are not eligible", () => {
  const result = generateTWResearchPlan([title(10, 337)], base);
  assert.equal(result.plan.items.length, 0);
  assert.equal(result.plan.rejections[0].reason, "no_eligible_offer");
});
test("Horror is excluded by explicit Chinese negative preference", () => {
  const result = generateTWResearchPlan([title(15, 8, [{ id: 27, name: "恐怖" }])], base);
  assert.equal(result.plan.items.length, 0);
  assert.equal(result.plan.rejections[0].reason, "excluded_genre");
});
test("Future scheduling outside observed data freshness is blocked", () => {
  const result = generateTWResearchPlan([title(10)], { ...base, startDate: "2026-12-20" });
  assert.equal(result.plan.items.length, 0);
});
test("Missing runtimes are explicitly returned as not schedulable", () => {
  const missing = normalizeTWMovie({ id: 20, runtime: null, title: "片長未知" },
    { results: { TW: {} } }, now);
  const result = generateTWResearchPlan([missing], base);
  assert.deepEqual(result.unschedulable, [{ tmdbId: 20, reason: "UNKNOWN_RUNTIME" }]);
});
test("Invalid time budgets and dates throw before scheduling", () => {
  assert.throws(() => generateTWResearchPlan([title(10)], { ...base, weeklyMinutes: 30 }));
  assert.throws(() => generateTWResearchPlan([title(10)], { ...base, dailyMinutes: 700 }));
  assert.throws(() => generateTWResearchPlan([title(10)], { ...base, startDate: "2026-02-30" }));
});

test("optional personal genre avoidance is enforced in real-observation research planning", () => {
  const original = generateTWResearchPlan([title(71)], base);
  assert.equal(original.plan.items.length, 1);
  const profile = setGenrePreference(emptyTastePassport(), "science-fiction", "avoid");
  const personalized = generateTWResearchPlan([title(71)], { ...base, tastePassport: profile });
  assert.equal(personalized.plan.items.length, 0);
});
test("personal watched movie remains excluded in real-observation research planning", () => {
  const profile = rateTasteWork(emptyTastePassport(), "tmdb:71", ["science-fiction"], "love", true);
  const personalized = generateTWResearchPlan([title(71)], { ...base, tastePassport: profile });
  assert.equal(personalized.plan.items.length, 0);
  assert.equal(personalized.plan.rejections[0].reason, "already_watched");
});
