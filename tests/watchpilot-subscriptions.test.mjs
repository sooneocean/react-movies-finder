import test from "node:test";
import assert from "node:assert/strict";
import { planViewing } from "../src/lib/watchpilot/engine.ts";
import { emptyTastePassport, setGenrePreference, rateTasteWork } from "../src/lib/watchpilot/taste-passport.ts";
import { simulateSubscriptionMonth } from "../src/lib/watchpilot/subscription-study.ts";

const accounts = () => [
  { providerId:"netflix", name:"Netflix",priceTwd:250,cycle:"monthly",active:true,paidThroughOn:"2026-11-10",canAvoidRenewal:true },
  { providerId:"disney", name:"Disney+",priceTwd:300,cycle:"monthly",active:true,paidThroughOn:"2026-11-15",canAvoidRenewal:true },
  { providerId:"max",name:"HBO Max",priceTwd:280,cycle:"monthly",active:false,paidThroughOn:null,canAvoidRenewal:true },
  { providerId:"prime",name:"Prime Video",priceTwd:190,cycle:"annual",active:false,paidThroughOn:null,canAvoidRenewal:true },
];
const input = () => ({
  startDate:"2026-11-07",weeklyMinutes:360,dailyMinutes:180,
  preferenceText:"想看科幻與懸疑",profile:emptyTastePassport(),
  accounts:accounts(),priceSource:"EXAMPLE",penaltyPer100Twd:20,
});
test("30-day simulation reports synthetic provenance, exact subset count and explicit scenarios",()=>{
  const x=simulateSubscriptionMonth(input());
  assert.equal(x.mode,"FIXTURE");
  assert.equal(x.priceSource,"EXAMPLE");
  assert.equal(x.simulatedChoices,16);
  assert.equal(x.startDate,"2026-11-07");
  assert.equal(x.endDate,"2026-12-06");
  assert.equal(x.algorithm,"subset_enumeration_greedy_viewing_v1");
});
test("keep-current baseline charges only future renewals, never sunk prepaid fees",()=>{
  const x=simulateSubscriptionMonth(input());
  assert.deepEqual(x.baseline.selectedAfterPrepay,["netflix","disney"]);
  assert.equal(x.baseline.estimatedNewChargesTwd,550);
  assert.equal(x.baseline.billingEvents.length,2);
  assert.deepEqual(x.baseline.billingEvents.map(y=>y.chargedOn),["2026-11-11","2026-11-16"]);
  assert.equal(x.noOptionalRenewals.estimatedNewChargesTwd,0);
});
test("not renewing retains already-paid access until day of expiry inclusive",()=>{
  const x=simulateSubscriptionMonth(input());
  const day = x.noOptionalRenewals.plan.items.find(item=>item.providerId==="netflix");
  assert.ok(day);
  assert.ok(day.date <= "2026-11-10");
  assert.equal(x.noOptionalRenewals.billingEvents.length,0);
});
test("never count remaining annual prepaid term as immediate avoidable savings",()=>{
  const annual={...input(),accounts:[{providerId:"netflix",name:"Netflix",priceTwd:6000,cycle:"annual",active:true,paidThroughOn:"2027-06-30",canAvoidRenewal:true}]};
  const x=simulateSubscriptionMonth(annual);
  assert.equal(x.baseline.estimatedNewChargesTwd,0);
  assert.equal(x.noOptionalRenewals.estimatedNewChargesTwd,0);
  assert.equal(x.baselineVsBalancedFutureCostDifferenceTwd,0);
});
test("cannot-avoid-renewal provider is included in every scenario",()=>{
  const v=input();
  v.accounts[0].canAvoidRenewal=false;
  const x=simulateSubscriptionMonth(v);
  assert.equal(x.simulatedChoices,8);
  assert.ok(x.balanced.selectedAfterPrepay.includes("netflix"));
  assert.ok(x.noOptionalRenewals.selectedAfterPrepay.includes("netflix"));
  assert.ok(x.noOptionalRenewals.estimatedNewChargesTwd>=250);
});
test("annual billing charges one event when activation occurs in the study horizon",()=>{
  const v=input();
  v.accounts=[{providerId:"prime",name:"Prime",priceTwd:1200,cycle:"annual",active:false,paidThroughOn:null,canAvoidRenewal:true}];
  const x=simulateSubscriptionMonth(v);
  assert.equal(x.baseline.estimatedNewChargesTwd,0);
  assert.equal(x.maxWatchValue.estimatedNewChargesTwd,1200);
  assert.equal(x.maxWatchValue.billingEvents.length,1);
});
test("mid-month renewal does not charge again for the same prepaid period",()=>{
  const v=input();
  v.accounts=[{providerId:"netflix",name:"Netflix",priceTwd:290,cycle:"monthly",active:true,paidThroughOn:"2026-11-28",canAvoidRenewal:true}];
  const x=simulateSubscriptionMonth(v);
  assert.equal(x.baseline.billingEvents.length,1);
  assert.equal(x.baseline.billingEvents[0].chargedOn,"2026-11-29");
});
test("30-day February horizon may require two monthly charges when cycles end early",()=>{
  const v=input();
  v.startDate="2027-02-01";
  v.accounts=[{providerId:"netflix",name:"Netflix",priceTwd:250,cycle:"monthly",active:false,paidThroughOn:null,canAvoidRenewal:true}];
  const x=simulateSubscriptionMonth(v);
  assert.equal(x.endDate,"2027-03-02");
  assert.deepEqual(x.maxWatchValue.billingEvents.map(y=>y.chargedOn),["2027-02-01","2027-03-01"]);
  assert.equal(x.maxWatchValue.estimatedNewChargesTwd,500);
});
test("all scenario plans respect global monthly and daily caps",()=>{
  const v=input(); v.dailyMinutes=120;v.weeklyMinutes=120;
  const x=simulateSubscriptionMonth(v);
  for(const scenario of [x.baseline,x.noOptionalRenewals,x.balanced,x.maxWatchValue]){
    assert.ok(scenario.plan.scheduledMinutes<=scenario.plan.requestedMinutes);
    assert.ok(scenario.plan.items.every(item=>item.runtimeMinutes<=120));
  }
});
test("personal genre exclusion and watched history reduce eligible schedule",()=>{
  const base=simulateSubscriptionMonth(input());
  let profile=setGenrePreference(emptyTastePassport(),"science-fiction","avoid");
  profile=rateTasteWork(profile,"sample-02",["mystery"],"love",true);
  const updated=simulateSubscriptionMonth({...input(),profile});
  assert.ok(!updated.baseline.plan.items.some(item=>["sample-01","sample-02"].includes(item.movieId)));
  assert.equal(updated.usedTasteEntries,1);
  assert.ok(updated.baseline.plan.items.length<base.baseline.plan.items.length);
});
test("optimized cost objective is no worse than keep-current and max-watch baseline",()=>{
  const x=simulateSubscriptionMonth(input());
  assert.ok(x.balanced.objective>=x.baseline.objective);
  assert.ok(x.maxWatchValue.watchValue>=x.baseline.watchValue);
  assert.equal(x.baselineVsBalancedFutureCostDifferenceTwd,
    x.baseline.estimatedNewChargesTwd-x.balanced.estimatedNewChargesTwd);
});
test("invalid price, conflicting profile, dates and duplicate provider IDs fail safely",()=>{
  const v=input();
  v.accounts[0].priceTwd=-1;
  assert.throws(()=>simulateSubscriptionMonth(v));
  assert.throws(()=>simulateSubscriptionMonth({...input(),startDate:"2026-02-30"}));
  assert.throws(()=>simulateSubscriptionMonth({...input(),accounts:[accounts()[0],accounts()[0]]}));
  assert.throws(()=>simulateSubscriptionMonth({...input(),profile:{...emptyTastePassport(),likedGenres:["drama"],avoidedGenres:["drama"]}}));
});
test("date-scoped entitlement is required even if subscribedProviders list says subscribed",()=>{
  const plan=planViewing({
    mode:"fixture",region:"TW",subscribedProviders:["netflix"],
    providerAccessPeriods:{netflix:[{startOn:"2026-11-07",endOn:"2026-11-08"}]},
    excludedGenres:[],slots:[{date:"2026-11-09",minutes:180}],
    candidates:[{id:"x",title:"Test",runtimeMinutes:100,genres:["drama"],tasteScore:80,qualityScore:80,
      offers:[{providerId:"netflix",region:"TW",access:"subscription",evidence:"FIXTURE",source:"fixture://test",observedOn:"2026-11-07"}]}],
  });
  assert.equal(plan.items.length,0);
  assert.equal(plan.rejections[0].reason,"no_eligible_offer");
});
test("subscription entitlement does not rewrite actual title expiry evidence",()=>{
  const x=simulateSubscriptionMonth(input());
  assert.ok(x.balanced.plan.items.every(item=>item.evidence==="FIXTURE"));
  assert.ok(x.balanced.plan.items.every(item=>item.confirmedExpiryOn===null ||
    ["2026-11-09","2026-11-12"].includes(item.confirmedExpiryOn)));
});
