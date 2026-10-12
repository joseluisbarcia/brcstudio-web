export const adjustmentTypes=['refund.created','refund.updated','refund.failed','charge.refunded','charge.dispute.created','charge.dispute.updated','charge.dispute.closed','charge.dispute.funds_withdrawn','charge.dispute.funds_reinstated'];
const id=(v,p)=>typeof v==='string'&&new RegExp('^'+p+'[A-Za-z0-9]+$').test(v);
const ref=v=>typeof v==='string'?v:v?.id??null;
const money=v=>Number.isSafeInteger(v)&&v>=0;
export function adjustment(event){
 if(!adjustmentTypes.includes(event.type))return null;
 const o=event.data?.object;if(!o||(o.livemode!==undefined&&o.livemode!==event.livemode)||o.currency!=='eur')throw Error('INVALID_ADJUSTMENT');
 const refund=event.type.startsWith('refund.'),dispute=event.type.startsWith('charge.dispute.');
 if(!(dispute?(id(o.id,'du_')||id(o.id,'dp_')):id(o.id,refund?'re_':'ch_'))||!money(o.amount)||(!refund&&!dispute&&!money(o.amount_refunded)))throw Error('INVALID_ADJUSTMENT');
 return {key:'adjustment-events/'+o.id+'/'+event.id,record:{stripe_event_id:event.id,event_type:event.type,created_at:new Date(event.created*1000).toISOString(),live:event.livemode,object_id:o.id,kind:refund?'refund':dispute?'dispute':'charge_refund_snapshot',stripe_charge_id:ref(refund||dispute?o.charge:o.id),stripe_payment_intent_id:ref(o.payment_intent),stripe_invoice_id:ref(o.invoice),stripe_customer_id:ref(o.customer),amount:o.amount,amount_refunded:refund||dispute?null:o.amount_refunded,currency:o.currency,status:o.status??(o.refunded?'refunded':'partially_refunded'),order_id:o.metadata?.brc_order_id??null,seller:o.metadata?.brc_seller??null,plan:o.metadata?.brc_plan??null,reconciliation_required:!o.metadata?.brc_order_id}};
}
// Returns current snapshots, never sums repeated cumulative charge snapshots.
// Ties are ambiguous (Stripe event timestamps have second resolution): retain
// the ambiguity and require reconciliation rather than guessing event order.
export function latestSnapshots(records){
 const groups=new Map();
 for(const r of records){const key=r.object_id??r.stripe_subscription_id??r.stripe_invoice_id;const prev=groups.get(key);if(!prev||r.created_at>prev.created_at)groups.set(key,{...r});else if(r.created_at===prev.created_at&&r.stripe_event_id!==prev.stripe_event_id)groups.set(key,{...prev,reconciliation_required:true,status:'ambiguous_same_second'})}
 return [...groups.values()];
}

// Join only exact payment references, never a shared customer/email.
export function attributeRecords(records){
 const rows=records.map(r=>({...r}));
 const fields=['stripe_payment_intent_id','stripe_charge_id','stripe_invoice_id','stripe_subscription_id'];
 for(let pass=0;pass<rows.length;pass++){
  let changed=false;
  for(const row of rows){
   if(row.order_id)continue;
   const matches=rows.filter(other=>other.order_id&&fields.some(k=>row[k]&&row[k]===other[k]));
   const orders=new Set(matches.map(r=>r.order_id));
   if(orders.size===1){const m=matches[0];Object.assign(row,{order_id:m.order_id,seller:m.seller,plan:row.plan??m.plan,terms_hash:m.terms_hash,reconciliation_required:false});changed=true}
  }
  if(!changed)break;
 }
 return rows;
}

// Resolve adjustments through Stripe's payment graph. Metadata is used only on
// the resolved Checkout/Subscription ownership resource, never by customer alone.
export async function resolveAdjustment(record,{secret,live,fetcher=fetch}){
 const get=async path=>{const response=await fetcher('https://api.stripe.com/v1/'+path,{headers:{Authorization:'Bearer '+secret,'Stripe-Version':'2026-09-30.endive'}});if(!response.ok)throw Error('RECONCILIATION_UNAVAILABLE');return response.json()};
 const check=o=>{if(o.livemode!==live)throw Error('RECONCILIATION_MODE_MISMATCH');return o};
 const result={...record};
 let pi=result.stripe_payment_intent_id;
 if(!pi&&id(result.stripe_charge_id,'ch_'))pi=ref(check(await get('charges/'+result.stripe_charge_id)).payment_intent);
 if(!id(pi,'pi_'))return result;
 result.stripe_payment_intent_id=pi;
 const payments=await get('invoice_payments?'+new URLSearchParams({'payment[type]':'payment_intent','payment[payment_intent]':pi,limit:'100'}));
 if(payments.has_more)throw Error('RECONCILIATION_PAGINATION_REQUIRED');
 const invoices=[...new Set((payments.data??[]).filter(p=>check(p).payment?.payment_intent===pi).map(p=>ref(p.invoice)))];
 let owner;
 if(invoices.length===1&&id(invoices[0],'in_')){
  const invoice=check(await get('invoices/'+invoices[0]));result.stripe_invoice_id=invoice.id;
  const sub=ref(invoice.parent?.subscription_details?.subscription??invoice.subscription);
  if(id(sub,'sub_')){owner=check(await get('subscriptions/'+sub));result.stripe_subscription_id=owner.id}
 }else if(invoices.length>1)return {...result,reconciliation_required:true};
 if(!owner){
  const sessions=await get('checkout/sessions?'+new URLSearchParams({payment_intent:pi,limit:'100'}));
  if(sessions.has_more)throw Error('RECONCILIATION_PAGINATION_REQUIRED');
  const matches=(sessions.data??[]).filter(s=>check(s).payment_intent===pi);
  if(matches.length===1)owner=matches[0];
 }
 const m=owner?.metadata;
 if(m?.brc_order_id){
  if(result.order_id&&result.order_id!==m.brc_order_id)return {...result,reconciliation_required:true};
  Object.assign(result,{order_id:m.brc_order_id,seller:m.brc_seller??null,plan:m.brc_plan??null,terms_hash:m.brc_terms_hash??null,reconciliation_required:false});
 }
 return result;
}
