import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
const password=crypto.randomBytes(32).toString('hex');
const price='price_1UPVEWDwLerTapleCN8WYU7L';
const sub={id:'sub_fixture',livemode:true,status:'active',items:{data:[{price:{id:price}}]},customer:{id:'cus_fixture',livemode:true,email:'fixture@example.invalid'},cancel_at_period_end:false};
function request(overrides={}){
 const expiry=String(Date.now()+600000),sig=crypto.createHmac('sha256',password).update('brc-admin-v1:'+expiry).digest('hex');
 return new Request('https://brcstudio.es/admin/ventas/bajas',{method:'POST',headers:{origin:overrides.origin??'https://brcstudio.es',cookie:overrides.cookie??`brc_admin=${expiry}.${sig}`},body:new URLSearchParams({subscription:'sub_fixture',email:'fixture@example.invalid',evidence:'fixture-message-reference-123',password,...overrides.form})});
}
async function setup({subscription=sub,failStore=false,failWrite=false}={}){
 const calls=[],rows=new Map();
 const context=vm.createContext({Request,Response,URL,URLSearchParams,Buffer,Date,Netlify:{env:{get:k=>({BRC_ADMIN_PASSWORD:password,STRIPE_LIVE_SECRET_KEY:'rk_live_fixture'})[k]}},fetch:async(url,options)=>{
  calls.push({url,...options});if(options.method==='GET')return Response.json(subscription);
  if(failWrite)return new Response('',{status:403});
  return Response.json({...subscription,cancel_at_period_end:true,cancel_at:1800000000});
 }});
 const mod=new vm.SourceTextModule(await readFile(new URL('../netlify/functions/brc-admin-cancellation.mjs',import.meta.url),'utf8'),{context});
 await mod.link(async name=>{
  const values=name==='node:crypto'?crypto:{getStore:()=>({async setJSON(k,v,o){if(failStore)throw Error('Unavailable');assert.equal(o.onlyIfNew,true);if(rows.has(k))return {modified:false};rows.set(k,v);return {modified:true}}})};
  return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v)},{context});
 });await mod.evaluate();return {handler:mod.namespace.default,calls,rows};
}
for(const [label,overrides,status] of [['unauthenticated',{cookie:''},401],['CSRF',{origin:'https://attacker.invalid'},403],['fresh password',{form:{password:'wrong'}},401],['missing evidence',{form:{evidence:''}},400]])test('cancellation rejects '+label,async()=>{
 const {handler,calls}=await setup();assert.equal((await handler(request(overrides))).status,status);assert.equal(calls.length,0);
});
for(const [label,subscription] of [['test subscription',{...sub,livemode:false}],['foreign plan',{...sub,items:{data:[{price:{id:'price_foreign'}}]}}],['wrong customer',{...sub,customer:{...sub.customer,email:'other@example.invalid'}}],['canceled subscription',{...sub,status:'canceled'}]])test('cancellation rejects '+label,async()=>{
 const {handler,calls}=await setup({subscription});assert.equal((await handler(request())).status,409);assert.equal(calls.filter(c=>c.method==='POST').length,0);
});
test('cancellation records evidence and actually sends end-of-period mutation without proration',async()=>{
 const {handler,calls,rows}=await setup();assert.equal((await handler(request())).status,200);
 const post=calls.find(c=>c.method==='POST');assert.ok(post);assert.equal(post.body.toString(),'cancel_at_period_end=true&proration_behavior=none');
 assert.equal(rows.size,2);assert.ok([...rows.keys()].some(k=>k.startsWith('result/')));
});
test('repeated request uses identical Stripe idempotency key and immutable audit keys',async()=>{
 const {handler,calls,rows}=await setup();await handler(request());await handler(request());
 const posts=calls.filter(c=>c.method==='POST');assert.equal(posts[0].headers['Idempotency-Key'],posts[1].headers['Idempotency-Key']);assert.equal(rows.size,2);
});
test('storage failure prevents mutation',async()=>{
 const {handler,calls}=await setup({failStore:true});assert.equal((await handler(request())).status,503);assert.equal(calls.filter(c=>c.method==='POST').length,0);
});
test('Stripe permission failure never claims completed cancellation',async()=>{
 const {handler,rows}=await setup({failWrite:true});assert.equal((await handler(request())).status,503);assert.equal([...rows.keys()].filter(k=>k.startsWith('result/')).length,0);
});
test('already scheduled cancellation is read-only in Stripe',async()=>{
 const {handler,calls}=await setup({subscription:{...sub,cancel_at_period_end:true}});assert.equal((await handler(request())).status,200);assert.equal(calls.filter(c=>c.method==='POST').length,0);
});
