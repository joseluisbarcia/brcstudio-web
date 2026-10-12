import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {amounts} from '../netlify/lib/orders.mjs';
import assert from 'node:assert/strict';
import {makeOffer,hash,customer} from '../netlify/lib/orders.mjs';
import {checkoutForOrder} from '../netlify/lib/order-checkout.mjs';
import {adjustment,latestSnapshots,attributeRecords} from '../netlify/lib/reconciliation.mjs';
const orderId='d937f213-00a4-44e9-b858-dd9803de4732';
const draft={id:orderId,business:'Fixture sandbox',email:'fixture@example.invalid',plan:'mensual',seller:'madrid'};
const input={environment:'test',tax_scope:'ES_GENERAL_21',fiscal_review:'confirmed',customer_name:'Fixture customer',customer_tax_id:'TEST-ONLY',customer_address:'Fixture address',supplier_name:'Fixture supplier',supplier_tax_id:'TEST-ONLY',supplier_address:'Fixture address',scope:'Fixture scope, no real contract',terms:'Fixture complementary conditions, no real contract'};
function memory(){const rows=new Map();return {rows,async get(k){return rows.get(k)??null},async setJSON(k,v,o){assert.equal(o.onlyIfNew,true);if(rows.has(k))return {modified:false};rows.set(k,structuredClone(v));return {modified:true}}}}
const env=k=>({STRIPE_TEST_SECRET_KEY:'rk_test_fixture',STRIPE_TEST_TAX_RATE:'txr_fixture',STRIPE_TEST_PRICE_PURCHASE:'price_purchase',STRIPE_TEST_PRICE_SETUP:'price_setup',STRIPE_TEST_PRICE_MONTHLY:'price_monthly'})[k];
async function ready(plan='mensual'){
 const offer=makeOffer({...draft,plan},input),db=memory();
 await db.setJSON('offer/'+orderId,offer,{onlyIfNew:true});
 await db.setJSON('acceptance/'+orderId,{order_id:orderId,email:offer.email,terms_hash:offer.terms_hash,environment:'test',authority_declaration:true,identity_verification:{authority_reference:'qa-authority'},identity_method:'independent_manual_verification_and_customer_declaration'},{onlyIfNew:true});
 return {offer,db,identity:{offer}};
}
function provider(offer){const calls=[];return {calls,fetch:async(url,o)=>{
 calls.push({url,...o});
 if(url.includes('/tax_rates/'))return Response.json({livemode:false,active:true,inclusive:false,percentage:21,country:'ES'});
 return Response.json({id:'cs_test_fixture',livemode:false,metadata:{brc_order_id:orderId},status:'open',url:'https://checkout.stripe.com/c/pay/fixture',amount_total:offer.amounts.total,currency:'eur'});
}}}
test('proposal hash covers fiscal details, scope, exact prices and conditions',()=>{
 const o=makeOffer(draft,input,100000);assert.equal(o.amounts.total,22748);assert.equal(o.amounts.renewal,4719);
 assert.notEqual(o.terms_hash,makeOffer(draft,{...input,scope:'different scope'},100000).terms_hash);
 assert.match(o.terms,/Sin permanencia ni penalización/);
});
for(const [name,change] of [['unreviewed VAT',{fiscal_review:''}],['unsupported jurisdiction',{tax_scope:'CANARIAS'}],['missing seller data',{supplier_tax_id:''}],['unfinished terms',{terms:'[PENDIENTE]'}]])test('proposal blocks '+name,()=>assert.throws(()=>makeOffer(draft,{...input,...change})));
test('manual link requires verified recipient, exact proposal and unexpired challenge',async()=>{
 const {db,offer}=await ready(),token='a'.repeat(64),key=hash(token);
 await db.setJSON('challenge/'+key,{order_id:orderId,email:offer.email,terms_hash:offer.terms_hash,expires_at:Date.now()+60000,verification:{verified_signatory:'Fixture'}},{onlyIfNew:true});
 assert.equal(await customer(token,db),null);
 await db.setJSON('delivery/'+key,{channel:'whatsapp_manual'},{onlyIfNew:true});assert.equal((await customer(token,db)).offer.id,orderId);
 db.rows.get('challenge/'+key).expires_at=0;assert.equal(await customer(token,db),null);
});
test('live proposal cannot create a session regardless of flags or acceptance',async()=>{
 const {identity,db}=await ready();identity.offer.environment='live';let calls=0;
 const r=await checkoutForOrder(identity,db,env,()=>{calls++});assert.equal(r.status,503);assert.equal(calls,0);
});
test('missing or mismatched acceptance cannot call Stripe',async()=>{
 const {identity,db}=await ready();db.rows.get('acceptance/'+orderId).terms_hash='wrong';
 const r=await checkoutForOrder(identity,db,env,()=>{throw Error('must not call')});assert.equal(r.status,403);
});
for(const plan of ['compra','mensual'])test('accepted '+plan+' binds consent/order/seller and taxes to Stripe',async()=>{
 const {offer,db,identity}=await ready(plan),api=provider(offer);
 const r=await checkoutForOrder(identity,db,env,api.fetch);assert.equal(r.status,200);
 const p=api.calls.find(c=>c.method==='POST');assert.equal(p.body.get('client_reference_id'),orderId);assert.equal(p.body.get('metadata[brc_terms_hash]'),offer.terms_hash);assert.equal(p.body.get('metadata[brc_seller]'),'madrid');
 assert.equal(p.body.get('line_items[0][tax_rates][0]'),'txr_fixture');
 if(plan==='mensual')assert.equal(p.body.get('subscription_data[default_tax_rates][0]'),'txr_fixture');
 else assert.equal(p.body.get('invoice_creation[enabled]'),'true');
});
test('concurrent requests keep one immutable attempt and identical Stripe request',async()=>{
 const {offer,db,identity}=await ready(),api=provider(offer);
 await Promise.all(Array.from({length:10},()=>checkoutForOrder(identity,db,env,api.fetch)));
 const posts=api.calls.filter(c=>c.method==='POST');assert.ok(posts.length>=1);
 assert.equal(new Set(posts.map(p=>p.headers['Idempotency-Key'])).size,1);assert.equal(new Set(posts.map(p=>p.body.toString())).size,1);
 assert.equal([...db.rows.keys()].filter(k=>k.startsWith('attempt/')).length,1);
});
test('expired uncertain attempt cannot be recreated after Stripe key retention',async()=>{
 const {offer,db,identity}=await ready(),api=provider(offer);
 await db.setJSON('attempt/'+orderId,{order_id:orderId,terms_hash:offer.terms_hash,created_at:Date.now()-25*3600000,expires_at:1},{onlyIfNew:true});
 const r=await checkoutForOrder(identity,db,env,api.fetch);assert.equal(r.status,409);assert.equal(api.calls.filter(c=>c.method==='POST').length,0);
});
test('inclusive or incorrect tax rate fails closed before Checkout',async()=>{
 const {db,identity}=await ready();const r=await checkoutForOrder(identity,db,env,async()=>Response.json({livemode:false,active:true,inclusive:true,percentage:21,country:'ES'}));assert.equal(r.status,409);
});
test('refund objects need no nonexistent livemode property and are never sales',()=>{
 const e={id:'evt_refund',created:1,livemode:true,type:'refund.updated',data:{object:{id:'re_fixture',amount:2000,currency:'eur',charge:'ch_fixture',status:'succeeded'}}};
 const r=adjustment(e);assert.equal(r.record.kind,'refund');assert.match(r.key,/^adjustment-events/);assert.equal(r.record.reconciliation_required,true);
});
test('refund/dispute snapshots cannot double count repeated cumulative amounts',()=>{
 const rows=[{object_id:'ch_fixture',stripe_event_id:'evt_new',created_at:'2026-10-12T12:00:00Z',amount_refunded:2000},{object_id:'ch_fixture',stripe_event_id:'evt_old',created_at:'2026-10-12T11:00:00Z',amount_refunded:1000}];
 assert.equal(latestSnapshots(rows).length,1);assert.equal(latestSnapshots(rows)[0].amount_refunded,2000);
});
test('same-second different Stripe states require reconciliation',()=>{
 const rows=['evt_one','evt_two'].map(stripe_event_id=>({object_id:'dp_fixture',stripe_event_id,created_at:'2026-10-12T12:00:00Z'}));assert.equal(latestSnapshots(rows)[0].reconciliation_required,true);
});

test('reconciliation attributes refunds through exact payment references, never customers',()=>{
 const sale={order_id:'order1',seller:'madrid',stripe_payment_intent_id:'pi_1',stripe_customer_id:'cus_1'};
 const rows=attributeRecords([sale,{object_id:'re_1',stripe_payment_intent_id:'pi_1'},{object_id:'re_2',stripe_customer_id:'cus_1'}]);
 assert.equal(rows[1].order_id,'order1');assert.equal(rows[1].seller,'madrid');assert.equal(rows[2].order_id,undefined);
});

// Only the in-memory VM substitutes the release constant. Production file remains false.
async function simulatedRelease(){
 const context=vm.createContext({URLSearchParams,Date});
 const dep=new vm.SyntheticModule(['amounts','hash'],function(){this.setExport('amounts',amounts);this.setExport('hash',hash)},{context});
 const source=readFileSync('netlify/lib/order-checkout.mjs','utf8');
 assert.match(source,/LIVE_ORDER_RELEASE_AUTHORIZED=false/);
 const mod=new vm.SourceTextModule(source.replace('LIVE_ORDER_RELEASE_AUTHORIZED=false','LIVE_ORDER_RELEASE_AUTHORIZED=true'),{context});
 await mod.link(()=>dep);await mod.evaluate();return mod.namespace.checkoutForOrder;
}
const liveEnv=k=>({BRC_LIVE_CHECKOUT_ENABLED:'true',STRIPE_LIVE_SECRET_KEY:'rk_live_simulated_only',STRIPE_LIVE_TAX_RATE:'txr_1UPX5ZDwLerTaplePClmgRMy'})[k];
async function liveFixture(){const f=await ready();f.offer=makeOffer(draft,{...input,environment:'live'});f.identity={offer:f.offer};Object.assign(f.db.rows.get('acceptance/'+orderId),{environment:'live',terms_hash:f.offer.terms_hash});return f;}
test('future activation simulation binds verified consent and immutable order to fixed live catalog without network',async()=>{
 const fn=await simulatedRelease(),f=await liveFixture(),calls=[];
 const result=await fn(f.identity,f.db,liveEnv,async(url,options)=>{
  calls.push({url,...options});
  if(url.includes('/tax_rates/'))return Response.json({livemode:true,active:true,inclusive:false,percentage:21,country:'ES'});
  return Response.json({id:'cs_live_simulated',livemode:true,url:'https://checkout.stripe.com/c/pay/simulated',amount_total:22748,currency:'eur'});
 });
 assert.equal(result.status,200);const post=calls.find(x=>x.method==='POST');
 assert.equal(post.body.get('metadata[brc_order_id]'),orderId);assert.equal(post.body.get('metadata[brc_terms_hash]'),f.offer.terms_hash);
 assert.equal(post.body.get('line_items[0][price]'),'price_1UPVE7DwLerTaplejCffcCrc');assert.equal(post.body.get('line_items[1][price]'),'price_1UPVEWDwLerTapleCN8WYU7L');
 assert.equal(post.body.get('adaptive_pricing[enabled]'),'false');assert.equal(post.body.get('subscription_data[default_tax_rates][0]'),'txr_1UPX5ZDwLerTaplePClmgRMy');
});
for(const [name,alter] of [
 ['missing acceptance',f=>f.db.rows.delete('acceptance/'+orderId)],
 ['admin authority assertion only',f=>f.db.rows.get('acceptance/'+orderId).identity_method='admin_checkbox'],
 ['missing authority declaration',f=>f.db.rows.get('acceptance/'+orderId).authority_declaration=false],
 ['wrong order acceptance',f=>f.db.rows.get('acceptance/'+orderId).order_id='other'],
 ['tampered proposal',f=>f.offer.scope='tampered'],
 ['expired proposal',f=>f.offer.expires_at=1]
])test('future activation still rejects '+name+' before provider call',async()=>{
 const fn=await simulatedRelease(),f=await liveFixture();alter(f);
 const r=await fn(f.identity,f.db,liveEnv,()=>{throw Error('network prohibited')});assert.equal(r.status,403);
});
test('future reviewed code still requires separate commercial environment flag',async()=>{
 const fn=await simulatedRelease(),f=await liveFixture();const r=await fn(f.identity,f.db,k=>k==='BRC_LIVE_CHECKOUT_ENABLED'?'false':liveEnv(k),()=>{throw Error('network prohibited')});assert.equal(r.status,503);
});
