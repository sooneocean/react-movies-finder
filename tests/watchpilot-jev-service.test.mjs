import test from 'node:test';
import assert from 'node:assert/strict';
import {createExperiment} from '../src/lib/watchpilot/decision-ab.ts';
import {evaluateWithJev,JevEvaluationError} from '../src/lib/watchpilot/jev-service.ts';
const c=(id)=>({id,title:'研究樣本'+id,genres:['crime'],runtimeMinutes:103,planScore:70,tasteScore:80,qualityScore:90,providerId:'netflix',evidence:'FIXTURE'});
const exp=createExperiment('想看犯罪電影',[c('a'),c('b')],'fixture');
const good={model:'jev-1.13.0',answers:{tonight:{type:'choice',choice:'opt_1',probabilities:{opt_1:0.75,opt_2:0.25},confidence:0.5}},usage:{input_tokens:111}};
test('disabled Jev performs zero network calls',async()=>{
  let calls=0;
  await assert.rejects(evaluateWithJev(exp,{enabled:false,apiKey:'fake-key',fetcher:async()=>{calls++;return new Response('{}')}}),e=>e.code==='DISABLED');
  assert.equal(calls,0);
});
test('missing key performs zero network calls',async()=>{
  let calls=0;
  await assert.rejects(evaluateWithJev(exp,{enabled:true,fetcher:async()=>{calls++;return new Response('{}')}}),e=>e.code==='NO_KEY');
  assert.equal(calls,0);
});
test('one valid call uses official endpoint with server-side key',async()=>{
  let calls=0;let received;
  const mock=async(url,init)=>{calls++;received={url,init};return Response.json(good)};
  const out=await evaluateWithJev(exp,{enabled:true,apiKey:'secret-model-key',fetcher:mock});
  assert.equal(out.selectedId,'a');assert.equal(calls,1);
  assert.equal(received.url,'https://api.typesafe.ai/v1/systemone');
  assert.equal(received.init.headers.Authorization,'Bearer secret-model-key');
  assert.equal(JSON.parse(received.init.body).questions.tonight.type,'choice');
  assert.ok(!JSON.stringify(out).includes('secret-model-key'));
});
test('429 does not auto-retry or fake baseline response',async()=>{
  let calls=0;
  await assert.rejects(evaluateWithJev(exp,{enabled:true,apiKey:'secret-model-key',fetcher:async()=>{calls++;return new Response('{}',{status:429})}}),e=>e.code==='RATE_LIMITED');
  assert.equal(calls,1);
});
test('Jev returning unlisted choice becomes BAD_RESPONSE',async()=>{
  await assert.rejects(evaluateWithJev(exp,{enabled:true,apiKey:'secret-model-key',fetcher:async()=>Response.json({...good,answers:{tonight:{...good.answers.tonight,choice:'opt_7'}}})}),e=>e.code==='BAD_RESPONSE');
});
