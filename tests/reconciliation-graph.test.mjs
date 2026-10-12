import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {adjustment,resolveAdjustment} from '../netlify/lib/reconciliation.mjs';
const events=JSON.parse(await readFile(new URL('./fixtures/stripe-sandbox-20261012.json',import.meta.url),'utf8'));
const event=events.find(e=>e.type==='charge.dispute.created');
const invoice=events.find(e=>e.type==='invoice.paid'&&e.data.object.id==='in_1UPi6eD95NECz80Fy9qOaOfb').data.object;
const subscription=events.find(e=>e.type==='customer.subscription.created'&&e.data.object.id==='sub_1UPi6eD95NECz80FUN1cmS6o').data.object;
const record=adjustment(event).record;
test('real sandbox dispute graph resolves payment → invoice → subscription → order',async()=>{
 const calls=[];
 const result=await resolveAdjustment(record,{secret:'rk_test_fixture',live:false,fetcher:async url=>{
  calls.push(url);
  if(url.includes('invoice_payments?')){assert.ok(url.includes(record.stripe_payment_intent_id));return Response.json({data:[{livemode:false,payment:{payment_intent:record.stripe_payment_intent_id},invoice:invoice.id}],has_more:false})}
  if(url.endsWith('invoices/'+invoice.id))return Response.json(invoice);
  if(url.endsWith('subscriptions/'+subscription.id))return Response.json(subscription);
  throw Error('Unexpected request');
 }});
 assert.equal(result.order_id,'qa-20261012-dispute');assert.equal(result.seller,'direccion');assert.equal(result.reconciliation_required,false);assert.equal(calls.length,3);
});
test('reconciliation API failure is not an acknowledged adjustment',async()=>{
 await assert.rejects(resolveAdjustment(record,{secret:'rk_test_fixture',live:false,fetcher:async()=>new Response('',{status:503})}));
});
test('reconciliation rejects resources returned from the other environment',async()=>{
 await assert.rejects(resolveAdjustment(record,{secret:'rk_test_fixture',live:false,fetcher:async()=>Response.json({data:[{livemode:true,payment:{payment_intent:record.stripe_payment_intent_id},invoice:invoice.id}]})}));
});
