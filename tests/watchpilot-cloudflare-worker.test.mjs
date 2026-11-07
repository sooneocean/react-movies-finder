import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../deploy/cloudflare/research-worker.mjs";

const base="https://watchpilot-lab-research.sooneocean.workers.dev";

test("Cloudflare research Worker exposes an explicit zero-key health contract",async()=>{
  const response=await worker.fetch(new Request(base+"/health"));
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.ok,true);
  assert.equal(payload.mode,"fixture");
  assert.equal(payload.paid_api,false);
});
test("Cloudflare research frontpage is Chinese and clearly labels synthetic data",async()=>{
  const res=await worker.fetch(new Request(base+"/"));
  assert.equal(res.status,200);
  const html=await res.text();
  assert.match(html,/lang="zh-Hant"/);
  assert.match(html,/Fixture|合成測試資料/);
  assert.match(html,/\/app\.js/);
  assert.match(html,/\/style\.css/);
  assert.ok(!html.includes("TYPESAFE_API_KEY"));
});
test("Cloudflare serves same-origin application JS and restrictive CSP",async()=>{
  const res=await worker.fetch(new Request(base+"/app.js"));
  assert.equal(res.status,200);
  assert.match(res.headers.get("Content-Type")??"",/javascript/);
  assert.match(res.headers.get("Content-Security-Policy")??"",/connect-src 'self'/);
  const js=await res.text();
  assert.doesNotThrow(()=>new Function(js));
  assert.ok(!js.includes("api.typesafe.ai"));
  assert.ok(!js.includes("api.themoviedb.org"));
  assert.match(js,/localStorage/);
});
test("Cloudflare CSS is present and unknown routes are 404",async()=>{
  const css=await worker.fetch(new Request(base+"/style.css"));
  assert.equal(css.status,200);
  assert.match(await css.text(),/\.layout/);
  const notFound=await worker.fetch(new Request(base+"/does-not-exist"));
  assert.equal(notFound.status,404);
});
