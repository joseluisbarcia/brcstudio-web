import {amounts,hash} from './orders.mjs';
// Commercial authorization requires a reviewed commit AND the environment flag.
export const LIVE_ORDER_RELEASE_AUTHORIZED=false;
const liveCatalog={compra:['price_1UPVC0DwLerTapleRTy7YYO6'],mensual:['price_1UPVE7DwLerTaplejCffcCrc','price_1UPVEWDwLerTapleCN8WYU7L']};
// Stable immutable attempt + Stripe idempotency. Never create another attempt
// for the same order, even after Stripe's minimum 24-hour idempotency retention.
export async function checkoutForOrder(identity,db,env,fetcher=fetch,now=Date.now()){
 const {offer}=identity;
 const live=offer.environment==='live';
 if(offer.environment!=='test'&&(!live||!LIVE_ORDER_RELEASE_AUTHORIZED||env('BRC_LIVE_CHECKOUT_ENABLED')!=='true'))return {status:503,error:'LIVE_CHECKOUT_DISABLED'};
 const {terms_hash,...unsigned}=offer;
 if(offer.authorized_by!=='direccion'||offer.expires_at<=now||offer.tax_scope!=='ES_GENERAL_21'||hash(JSON.stringify(unsigned))!==terms_hash)return {status:403,error:'AUTHORIZED_PROPOSAL_REQUIRED'};
 const acceptance=await db.get('acceptance/'+offer.id,{type:'json'});
 if(!acceptance||acceptance.terms_hash!==offer.terms_hash||acceptance.email!==offer.email||acceptance.environment!==offer.environment||acceptance.order_id!==offer.id||acceptance.authority_declaration!==true||!acceptance.identity_verification?.authority_reference||acceptance.identity_method!=='independent_manual_verification_and_customer_declaration')return {status:403,error:'ACCEPTANCE_REQUIRED'};
 const secret=env(live?'STRIPE_LIVE_SECRET_KEY':'STRIPE_TEST_SECRET_KEY'),tax=env(live?'STRIPE_LIVE_TAX_RATE':'STRIPE_TEST_TAX_RATE');
 const prices=live?liveCatalog[offer.plan]:offer.plan==='compra'?[env('STRIPE_TEST_PRICE_PURCHASE')]:[env('STRIPE_TEST_PRICE_SETUP'),env('STRIPE_TEST_PRICE_MONTHLY')];
 if(!(live?/^(sk|rk)_live_/:/^(sk|rk)_test_/).test(secret??'')||!/^txr_/.test(tax??'')||!prices||prices.some(x=>!/^price_/.test(x??''))||(live&&tax!=='txr_1UPX5ZDwLerTaplePClmgRMy'))return {status:503,error:'CHECKOUT_CONFIGURATION_MISSING'};
 const existing=await db.get('checkout/'+offer.id,{type:'json'});
 const api=async(path,options={})=>{
  const response=await fetcher('https://api.stripe.com/v1/'+path,{...options,headers:{Authorization:'Bearer '+secret,...options.headers}});
  if(!response.ok)throw Error('STRIPE_UNAVAILABLE');return response.json();
 };
 if(existing){
  const session=await api('checkout/sessions/'+encodeURIComponent(existing.session_id));
  if(session.livemode!==live||session.metadata?.brc_order_id!==offer.id)return {status:409,error:'SESSION_MISMATCH'};
  return session.status==='open'&&session.url?.startsWith('https://checkout.stripe.com/')?{status:200,url:session.url,id:session.id}:{status:409,error:session.status==='complete'?'ORDER_ALREADY_PAID_OR_PROCESSING':'CHECKOUT_EXPIRED'};
 }
 const taxRate=await api('tax_rates/'+encodeURIComponent(tax));
 if(taxRate.livemode!==live||taxRate.active!==true||taxRate.inclusive!==false||taxRate.percentage!==21||taxRate.country!=='ES')return {status:409,error:'TAX_RATE_MISMATCH'};
 const candidate={order_id:offer.id,created_at:now,expires_at:Math.floor(now/1000)+3600,terms_hash:offer.terms_hash,prices,tax};
 await db.setJSON('attempt/'+offer.id,candidate,{onlyIfNew:true});
 const attempt=await db.get('attempt/'+offer.id,{type:'json'});
 if(!attempt||attempt.terms_hash!==offer.terms_hash)return {status:409,error:'ATTEMPT_MISMATCH'};
 if(now-attempt.created_at>20*3600000||attempt.expires_at<=Math.floor(now/1000))return {status:409,error:'MANUAL_RECONCILIATION_REQUIRED'};
 const metadata={brc_order_id:offer.id,brc_plan:offer.plan,brc_seller:offer.seller,brc_terms_hash:offer.terms_hash,brc_acceptance_id:hash(offer.id+':'+acceptance.terms_hash),internal_test:String(!live)};
 const body=new URLSearchParams({mode:offer.plan==='compra'?'payment':'subscription','adaptive_pricing[enabled]':'false',client_reference_id:offer.id,customer_email:offer.email,billing_address_collection:'required','tax_id_collection[enabled]':'true',expires_at:String(attempt.expires_at),success_url:live?'https://brcstudio.es/?pago=correcto&session_id={CHECKOUT_SESSION_ID}':'https://brcstudio.es/stripe-test-success.html?session_id={CHECKOUT_SESSION_ID}',cancel_url:'https://brcstudio.es/pedido'});
 const fixture=live?null:await db.get('test-customer/'+offer.id,{type:'json'});
 if(fixture?.qa===true&&/^cus_[A-Za-z0-9]+$/.test(fixture.customer)){
  const customer=await api('customers/'+fixture.customer);
  if(customer.livemode!==live||customer.test_clock!==fixture.clock)return {status:409,error:'TEST_CUSTOMER_MISMATCH'};
  body.delete('customer_email');body.set('customer',customer.id);body.set('customer_update[address]','auto');body.set('customer_update[name]','auto');
 }
 for(const [k,v] of Object.entries(metadata)){
  body.set(`metadata[${k}]`,v);
  body.set(`${offer.plan==='mensual'?'subscription_data':'payment_intent_data'}[metadata][${k}]`,v);
  if(offer.plan==='compra')body.set(`invoice_creation[invoice_data][metadata][${k}]`,v);
 }
 attempt.prices.forEach((price,i)=>{body.set(`line_items[${i}][price]`,price);body.set(`line_items[${i}][quantity]`,'1');body.set(`line_items[${i}][tax_rates][0]`,attempt.tax)});
 if(offer.plan==='mensual')body.set('subscription_data[default_tax_rates][0]',attempt.tax);
 else body.set('invoice_creation[enabled]','true');
 const session=await api('checkout/sessions',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':'brc-order-'+offer.environment+'-'+offer.id},body});
 if(session.livemode!==live||!(live?/^cs_live_[A-Za-z0-9]+$/:/^cs_test_[A-Za-z0-9]+$/).test(session.id??'')||!session.url?.startsWith('https://checkout.stripe.com/')||session.amount_total!==amounts(offer.plan).total||session.currency!=='eur')return {status:502,error:'INVALID_STRIPE_SESSION'};
 await db.setJSON('checkout/'+offer.id,{order_id:offer.id,session_id:session.id,environment:offer.environment,terms_hash:offer.terms_hash,created_at:new Date(now).toISOString()},{onlyIfNew:true});
 const binding=await db.get('checkout/'+offer.id,{type:'json'});
 if(binding?.session_id!==session.id)return {status:409,error:'SESSION_CONFLICT'};
 return {status:200,url:session.url,id:session.id};
}
