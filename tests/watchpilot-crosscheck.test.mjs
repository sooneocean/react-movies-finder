import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTWMovie } from "../src/lib/watchpilot/tmdb-tw.ts";
import {
  emptyCheckStore, saveHumanCheck, removeHumanCheck, validateHumanCheck,
  reviewCoverage, generateCrossCheckedTWPlan, validateCheckStore,
  persistCheckStore, loadCheckStore, TW_CHECK_STORAGE_KEY,
} from "../src/lib/watchpilot/tw-crosscheck.ts";
import { emptyTastePassport, setGenrePreference } from "../src/lib/watchpilot/taste-passport.ts";

const now = new Date("2026-11-08T08:00:00.000Z");
function title(id=1, providerName="Netflix", providerId=8, observation=now.toISOString()) {
  return normalizeTWMovie({
    id, title:"研究用台灣電影"+id, original_title:"Sample "+id,
    runtime:105, genres:[{id:878,name:"科幻"}],vote_average:8.5,vote_count:100,
  },{results:{TW:{flatrate:[{provider_id:providerId,provider_name:providerName}]}}},observation);
}
function check(id=1, provider="netflix", result="subscription", extra={}) {
  return {
    workId:"tmdb:"+id,providerId:provider,checkedAt:now.toISOString(),
    tmdbCheckedAt:now.toISOString(),sourceUrl:"https://www.netflix.com/watch/123",
    result,reviewerConfirmed:true,...extra,
  };
}
function settings(extra={}) {
  return {startDate:"2026-11-08",weeklyMinutes:360,dailyMinutes:180,
    subscribedProviders:["netflix","disney"],preferenceText:"科幻，不要恐怖片", ...extra};
}
test("no manual evidence means zero schedulable movies, not no catalog",()=>{
  const r=generateCrossCheckedTWPlan([title()],emptyCheckStore(),settings(),now);
  assert.equal(r.eligibleCandidateCount,0);
  assert.equal(r.plan.plan.items.length,0);
  assert.equal(r.coverage.agreementRate,null);
  assert.equal(r.coverage.readyForBroadResearch,false);
});
test("fresh matching subscription check makes only the specific TW offer eligible",()=>{
  const verified=saveHumanCheck(emptyCheckStore(),check());
  const r=generateCrossCheckedTWPlan([title()],verified,settings(),now);
  assert.equal(r.eligibleCandidateCount,1);
  assert.equal(r.plan.plan.items.length,1);
  assert.equal(r.plan.plan.items[0].movieId,"tmdb:1");
  assert.equal(r.plan.plan.items[0].evidence,"OBSERVED"); // never platform verified
  assert.equal(r.coverage.matched,1);
  assert.equal(r.coverage.comparable,1);
});
test("known disagreement never promotes an undocumented subscription",()=>{
  const r=generateCrossCheckedTWPlan([title()],{version:1,checks:[check(1,"disney")]},settings(),now);
  assert.equal(r.coverage.disagreements,1);
  assert.equal(r.plan.plan.items.length,0);
});
test("manual not-found contradiction does not schedule a claimed TMDB offer",()=>{
  const r=generateCrossCheckedTWPlan([title()],{version:1,checks:[check(1,"netflix","not_found")]},settings(),now);
  assert.equal(r.coverage.disagreements,1);
  assert.equal(r.plan.plan.items.length,0);
});
test("positive rent-only or ads-only evidence is not treated as subscribed access",()=>{
  const x=title();
  x.offers[0].access="rent";
  const r=generateCrossCheckedTWPlan([x],{version:1,checks:[check(1,"netflix","rent")]},settings(),now);
  assert.equal(r.coverage.matched,1);
  assert.equal(r.eligibleCandidateCount,0);
  assert.equal(r.plan.plan.items.length,0);
});
test("free offer confirmed by user can be scheduled without a subscription",()=>{
  const x=title(); x.offers[0].access="free";
  const r=generateCrossCheckedTWPlan([x],{version:1,checks:[check(1,"netflix","free")]},
    settings({subscribedProviders:[]}),now);
  assert.equal(r.plan.plan.items.length,1);
});
test("manual unknown result is unscored and blocks eligible candidates",()=>{
  const r=generateCrossCheckedTWPlan([title()],{version:1,checks:[check(1,"netflix","unknown")]},settings(),now);
  assert.equal(r.coverage.unknown,1);
  assert.equal(r.coverage.comparable,0);
  assert.equal(r.plan.plan.items.length,0);
});
test("after 72h review and catalog evidence are stale, no schedule",()=>{
  const after=new Date("2026-11-12T08:00:00.000Z");
  const r=generateCrossCheckedTWPlan([title()],{version:1,checks:[check()]},
    settings({startDate:"2026-11-12"}),after);
  assert.equal(r.coverage.stale,1);
  assert.equal(r.eligibleCandidateCount,0);
});
test("reloading a newer TMDB snapshot invalidates old check even if offers match",()=>{
  const changed=title(1,"Netflix",8,"2026-11-08T09:00:00.000Z");
  const r=reviewCoverage([changed],{version:1,checks:[check()]},now);
  assert.equal(r.coverage.stale,1);
});
test("review against an untracked film cannot be considered a match",()=>{
  const r=reviewCoverage([],{version:1,checks:[check()]},now);
  assert.equal(r.coverage.stale,1);
});
test("cross-check evidence must have safe HTTPS URL and explicit review",()=>{
  assert.throws(()=>validateHumanCheck(check(1,"netflix","subscription",{sourceUrl:"javascript:alert(1)"})));
  assert.throws(()=>validateHumanCheck(check(1,"netflix","subscription",{sourceUrl:"https://user:pw@netflix.com"})));
  assert.throws(()=>validateHumanCheck(check(1,"netflix","subscription",{reviewerConfirmed:false})));
  assert.throws(()=>validateHumanCheck(check(1,"netflix","subscription",{result:"invalid"})));
  assert.throws(()=>validateHumanCheck(check(1,"netflix","subscription",{checkedAt:"not a date"})));
});
test("review time cannot materially precede the TMDB observation",()=>{
  assert.throws(()=>validateHumanCheck(check(1,"netflix","subscription",{checkedAt:"2026-11-07T00:00:00.000Z"})));
});
test("review storage upserts each title/provider; can delete mistaken evidence",()=>{
  let store=saveHumanCheck(emptyCheckStore(),check());
  store=saveHumanCheck(store,check(1,"netflix","not_found"));
  assert.equal(store.checks.length,1);
  assert.equal(store.checks[0].result,"not_found");
  assert.deepEqual(removeHumanCheck(store,"tmdb:1","netflix"),emptyCheckStore());
});
test("local-only persistent storage loads valid entries and recovers from corruption",()=>{
  const contents=new Map();
  const storage={getItem:k=>contents.get(k)??null,setItem:(k,v)=>contents.set(k,v)};
  const entries=saveHumanCheck(emptyCheckStore(),check());
  persistCheckStore(storage,entries);
  assert.deepEqual(loadCheckStore(storage),entries);
  assert.ok(contents.has(TW_CHECK_STORAGE_KEY));
  contents.set(TW_CHECK_STORAGE_KEY,"{broken");
  assert.deepEqual(loadCheckStore(storage),emptyCheckStore());
});
test("duplicate entries in stored JSON are rejected, never trusted implicitly",()=>{
  assert.throws(()=>validateCheckStore({version:1,checks:[check(),check()]}));
});
test("comparison sample of 20 films across 2 providers can meet exploratory gate",()=>{
  const titles=Array.from({length:20},(_,i)=> i<10?
    title(i+1):title(i+1,"Disney Plus",337));
  const checks={version:1,checks:Array.from({length:20},(_,i)=>i<10?
    check(i+1):check(i+1,"disney","subscription"))};
  const r=reviewCoverage(titles,checks,now);
  assert.equal(r.coverage.distinctTitles,20);
  assert.equal(r.coverage.distinctProviders,2);
  assert.equal(r.coverage.agreementRate,1);
  assert.equal(r.coverage.readyForBroadResearch,true);
});
test("a 20-film sample with only one provider cannot pass multi-platform research gate",()=>{
  const titles=Array.from({length:20},(_,i)=>title(i+1));
  const checks={version:1,checks:Array.from({length:20},(_,i)=>check(i+1))};
  assert.equal(reviewCoverage(titles,checks,now).coverage.readyForBroadResearch,false);
});
test("the minimum sample gate fails below 80 percent agreement",()=>{
  const titles=Array.from({length:20},(_,i)=>i<10?title(i+1):title(i+1,"Disney Plus",337));
  const checks={version:1,checks:Array.from({length:20},(_,i)=>i<10?
    check(i+1,"netflix",i<5?"not_found":"subscription"):
    check(i+1,"disney","subscription"))};
  const r=reviewCoverage(titles,checks,now);
  assert.equal(r.coverage.agreementRate,0.75);
  assert.equal(r.coverage.readyForBroadResearch,false);
});
test("user's avoided genres remain excluded even after human cross-check",()=>{
  const profile=setGenrePreference(emptyTastePassport(),"science-fiction","avoid");
  const r=generateCrossCheckedTWPlan([title()],{version:1,checks:[check()]},
    settings({tastePassport:profile}),now);
  assert.equal(r.eligibleCandidateCount,1);
  assert.equal(r.plan.plan.items.length,0);
});
test("unknown future or past scheduling windows are rejected instead of invented",()=>{
  const store={version:1,checks:[check()]};
  assert.throws(()=>generateCrossCheckedTWPlan([title()],store,settings({startDate:"2026-11-07"}),now));
  assert.throws(()=>generateCrossCheckedTWPlan([title()],store,settings({startDate:"2026-11-16"}),now));
});
