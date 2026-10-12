import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as crypto from 'node:crypto';

const signingSecret='whsec_'+crypto.randomBytes(32).toString('hex');
const tax='txr_1UPX5ZDwLerTaplePClmgRMy';
const price='price_1UPVEWDwLerTapleCN8WYU7L';
async function load(file,{env={},fetch=()=>{throw Error('Network forbidden in audit')},store,exportName="default"}={}) {
 const context=vm.createContext({Request,Response,URL,URLSearchParams,Buffer,Date,console,Netlify:{env:{get:k=>env[k]}},fetch});
 const module=new vm.SourceTextModule(await readFile(new URL('../netlify/functions/'+file,import.meta.url),'utf8'),{context});
 await module.link(async name=>{
  const values=name==='node:crypto'?crypto:{getStore:options=>{assert.equal(options.name,'brc-live-sales');assert.equal(options.consistency,'strong');return store}};
  const names=Object.keys(values);return new vm.SyntheticModule(names,function(){for(const key of names)this.setExport(key,values[key])},{context});
 });await module.evaluate();return module.namespace[exportName];
}
const event=(type='checkout.session.completed',object={})=>({id:'evt_audit1',created:Math.floor(Date.now()/1000),livemode:true,type,data:{object:{id:'cs_live_audit1',livemode:true,status:'complete',mode:'payment',payment_status:'paid',metadata:{brc_plan:'compra'},amount_total:59290,currency:'eur',...object}}});
function signed(value,{age=0,signature,raw}={}) {
 const body=raw??JSON.stringify(value),timestamp=Math.floor(Date.now()/1000)+age;
 const sig=crypto.createHmac('sha256',signingSecret).update(timestamp+'.'+body).digest('hex');
 return new Request('https://brcstudio.es/api/stripe-live-webhook',{method:'POST',body,headers:{'stripe-signature':signature??`t=${timestamp},v1=${sig}`}});
}
function memory() {const records=new Map();return {records,async setJSON(key,value,options){assert.equal(options.onlyIfNew,true);if(records.has(key))return {modified:false};records.set(key,value);return {modified:true}}}}
async function webhook(store=memory()) {return {store,handler:await load('stripe-live-webhook.mjs',{env:{STRIPE_LIVE_WEBHOOK_SECRET:signingSecret},store})}}

test('live gate fails closed before Stripe for disabled environment values',async()=>{
 for(const flag of [undefined,'false','0','TRUE','',false]) {
  const handler=await load('stripe-live-checkout.mjs',{env:{BRC_LIVE_CHECKOUT_ENABLED:flag}});
  assert.equal((await handler(new Request('https://brcstudio.es/api/stripe-live-checkout',{method:'POST',body:'{}'}))).status,503);
  assert.equal((await (await handler(new Request('https://brcstudio.es/api/stripe-live-checkout'))).json()).enabled,false);
 }
});
test('GET remains unavailable when the environment flag requests activation',async()=>{
 const handler=await load('stripe-live-checkout.mjs',{env:{BRC_LIVE_CHECKOUT_ENABLED:'true'}});
 assert.equal((await (await handler(new Request('https://brcstudio.es/api/stripe-live-checkout'))).json()).enabled,false);
});
test('production route cannot be activated by an environment flag or an admin assertion',async()=>{
 const h=await load('stripe-live-checkout.mjs',{env:{BRC_LIVE_CHECKOUT_ENABLED:'true'}});
 assert.equal((await h(new Request('https://brcstudio.es/api/stripe-live-checkout',{method:'POST',body:JSON.stringify({plan:'compra',terms_accepted:true})}))).status,503);
 assert.equal((await (await h(new Request('https://brcstudio.es/api/stripe-live-checkout'))).json()).release_ready,false);
});
const checkoutEnv={BRC_LIVE_CHECKOUT_ENABLED:'true',STRIPE_LIVE_SECRET_KEY:'rk_live_'+crypto.randomBytes(24).toString('hex'),STRIPE_LIVE_TAX_RATE:tax};
const request=(plan='compra',extra={})=>new Request(extra.url??'https://brcstudio.es/api/stripe-live-checkout',{method:'POST',body:extra.body??JSON.stringify({plan}),headers:{origin:extra.origin??'https://brcstudio.es','idempotency-key':extra.key??'d937f213-00a4-44e9-b858-dd9803de4732'}});
for(const plan of ['compra','mensual'])test('Checkout '+plan+' uses fixed catalog, tax and idempotency',async()=>{
 let sent;
 const handler=await load('stripe-live-checkout.mjs',{exportName:'createCheckout',env:checkoutEnv,fetch:async(url,options)=>{sent=options;return Response.json({livemode:true,id:'cs_live_fixture',url:'https://checkout.stripe.com/c/pay/fixture'})}});
 assert.equal((await handler(request(plan))).status,200);
 assert.equal(sent.headers['Idempotency-Key'],'brc-live-d937f213-00a4-44e9-b858-dd9803de4732');
 assert.equal(sent.body.get('line_items[0][tax_rates][0]'),tax);
 assert.equal(sent.body.get('line_items[0][quantity]'),'1');
 if(plan==='mensual'){
  assert.equal(sent.body.get('subscription_data[default_tax_rates][0]'),tax);
  assert.equal(sent.body.get('subscription_data[metadata][brc_plan]'),'mensual');
  assert.equal(sent.body.get('line_items[1][price]'),price);
  assert.equal(sent.body.get('line_items[1][tax_rates][0]'),tax);
 }else assert.equal(sent.body.get('line_items[0][price]'),'price_1UPVC0DwLerTapleRTy7YYO6');
});
for(const [label,req,status] of [
 ['host',()=>request('compra',{url:'https://preview.netlify.app/api/stripe-live-checkout'}),403],
 ['origin',()=>request('compra',{origin:'https://attacker.invalid'}),403],
 ['unknown plan',()=>request('discount'),400],['prototype plan',()=>request('__proto__'),400],
 ['invalid JSON',()=>request('compra',{body:'{'}),400],['missing idempotency',()=>request('compra',{key:''}),400]])
 test('Checkout rejects '+label,async()=>{const h=await load('stripe-live-checkout.mjs',{exportName:'createCheckout',env:checkoutEnv});assert.equal((await h(req())).status,status)});
for(const [label,env] of [['test key',{STRIPE_LIVE_SECRET_KEY:'sk_test_fixture'}],['wrong tax',{STRIPE_LIVE_TAX_RATE:'txr_other'}]])
 test('Checkout rejects '+label,async()=>{const h=await load('stripe-live-checkout.mjs',{exportName:'createCheckout',env:{...checkoutEnv,...env}});assert.equal((await h(request())).status,503)});
test('malformed provider JSON gives controlled 502',async()=>{const h=await load('stripe-live-checkout.mjs',{exportName:'createCheckout',env:checkoutEnv,fetch:async()=>new Response('invalid')});assert.equal((await h(request())).status,502)});
for(const [label,value,options,status] of [
 ['missing signature',event(),{signature:''},400],['forged signature',event(),{signature:'t=1,v1=bad'},400],
 ['expired signature',event(),{age:-301},400],['future signature',event(),{age:301},400],
 ['malformed signed JSON',null,{raw:'{'},400],['signed null',null,{},400],
 ['test event',{...event(),livemode:false},{},400],['test object',event(undefined,{livemode:false}),{},400],
 ['invalid event date',{...event(),created:'bad'},{},400],
 ['unpaid session',event(undefined,{payment_status:'unpaid'}),{},200],
 ['foreign session',event(undefined,{metadata:{}}),{},200],
 ['wrong currency',event(undefined,{currency:'usd'}),{},400],
 ['invalid amount',event(undefined,{amount_total:-1}),{},400],
 ['unknown event',event('irrelevant'),{},200]])test('Webhook '+label,async()=>{
 const {handler,store}=await webhook();assert.equal((await handler(signed(value,options))).status,status);assert.equal(store.records.size,0);
});
test('valid signatures including rotation, concurrent duplicates and different event IDs save one sale',async()=>{
 const {handler,store}=await webhook();const e=event();
 const req=signed(e);req.headers.set('stripe-signature',req.headers.get('stripe-signature')+',v1='+'0'.repeat(64));
 assert.equal(await (await handler(req)).text(),'Registered');
 const results=await Promise.all(Array.from({length:15},(_,i)=>handler(signed({...e,id:'evt_duplicate'+i}))));
 assert.ok(results.every(r=>r.status===200));assert.equal(store.records.size,1);
 assert.equal(store.records.get('checkout/cs_live_audit1').plan,'compra');
});
test('failed persistence yields 503; successful retry saves once',async()=>{
 const store=memory(),save=store.setJSON.bind(store);let fail=true;
 store.setJSON=async(...args)=>{if(fail)throw Error('unavailable');return save(...args)};
 const {handler}=await webhook(store);assert.equal((await handler(signed(event()))).status,503);
 fail=false;assert.equal((await handler(signed(event()))).status,200);assert.equal(store.records.size,1);
});
const invoice=(reason='subscription_cycle',status='paid')=>({id:'in_audit1',livemode:true,status,billing_reason:reason,parent:{subscription_details:{subscription:'sub_audit1'}},currency:'eur',amount_due:4719,amount_paid:status==='paid'?4719:0,lines:{data:[{pricing:{price_details:{price}}}],has_more:false}});
test('renewals deduplicate by invoice; initial invoice is journal only',async()=>{
 const {handler,store}=await webhook();
 for(const id of ['evt_renewal1','evt_renewal2'])assert.equal((await handler(signed({...event('invoice.paid',invoice()),id}))).status,200);
 assert.equal(store.records.size,1);assert.equal(store.records.get('renewal/in_audit1').amount_total,4719);
 await handler(signed(event('invoice.paid',invoice('subscription_create'))));
 assert.ok(store.records.has('invoice-events/in_audit1/evt_audit1'));assert.equal([...store.records.keys()].filter(k=>k.startsWith('renewal/')).length,1);
});
test('failed payment and required action persist without a sale',async()=>{
 for(const type of ['invoice.payment_failed','invoice.payment_action_required']){
  const {handler,store}=await webhook();await handler(signed(event(type,invoice('subscription_cycle','open'))));
  assert.equal(store.records.size,1);assert.ok([...store.records.keys()][0].startsWith('invoice-events/'));
 }
});
test('out-of-order subscription events are immutable snapshots',async()=>{
 const {handler,store}=await webhook();
 const obj={id:'sub_audit1',livemode:true,items:{data:[{price:{id:price}}]},status:'canceled'};
 await handler(signed(event('customer.subscription.deleted',obj)));
 await handler(signed({...event('customer.subscription.created',{...obj,status:'active'}),id:'evt_older',created:Math.floor(Date.now()/1000)-600}));
 assert.equal(store.records.size,2);assert.equal(store.records.get('subscription-events/sub_audit1/evt_audit1').status,'canceled');
});
test('test checkout remains test-only in isolated local execution',async()=>{
 const h=await load('stripe-test-checkout.mjs',{env:{STRIPE_TEST_SECRET_KEY:'sk_live_fixture',STRIPE_TEST_TAX_RATE:'txr_fixture'}});
 assert.equal((await h(request())).status,503);
});
