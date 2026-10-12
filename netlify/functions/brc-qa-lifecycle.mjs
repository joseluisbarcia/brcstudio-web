import {getStore} from '@netlify/blobs';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import sales from './brc-admin-sales.mjs';
import {handleCancellation} from './brc-admin-cancellation.mjs';
const order='a237bc13-84a9-49e4-a197-60a552ff1078',subscription='sub_1UPje3D95NECz80FqvaSC8Hw',customer='cus_VQZBRQdNADjeOj',clock='clock_1UPi2WD95NECz80FjPrX6YHR';
const accessHash='a83e0769546d12731d78d1f6172e26466399a6cd0626d1a9cafbfd8dabf4dc2b';
const headers={'cache-control':'no-store, private','x-robots-tag':'noindex','referrer-policy':'no-referrer'};
export default async function(req){
 const given=createHash('sha256').update(req.headers.get('authorization')??'').digest();
 if(Date.now()>1791936000000||!timingSafeEqual(given,Buffer.from(accessHash,'hex')))return new Response('',{status:404,headers});
 if(!['GET','POST'].includes(req.method))return new Response('',{status:405,headers});
 const secret=Netlify.env.get('STRIPE_TEST_SECRET_KEY');
 if(!/^(sk|rk)_test_/.test(secret??'')||Netlify.env.get('BRC_LIVE_CHECKOUT_ENABLED')==='true')return Response.json({error:'UNSAFE_CONFIGURATION'},{status:409,headers});
 const api=async(path,body)=>{const r=await fetch('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+secret,'Stripe-Version':'2026-09-30.endive',...(body?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':'brc-final-lifecycle-'+createHash('sha256').update(path+body.toString()).digest('hex')}:{})},...(body?{body}:{})});if(!r.ok)throw Error('STRIPE_'+r.status+'_'+path.split('?')[0]);return r.json()};
 try{
  if((await api('account')).id!=='acct_1UPRtoD95NECz80F')throw Error('WRONG_ACCOUNT');
  let sub=await api('subscriptions/'+subscription);
  if(sub.livemode!==false||sub.customer!==customer||sub.test_clock!==clock||sub.metadata?.brc_order_id!==order)throw Error('WRONG_FIXTURE');
  const siblings=await api('subscriptions?'+new URLSearchParams({customer,status:'all',limit:'100'}));
  if(siblings.has_more||siblings.data.some(s=>s.id!==subscription&&s.status!=='canceled'))throw Error('UNRELATED_ACTIVE_SUBSCRIPTION');
  const password=Netlify.env.get('BRC_ADMIN_PASSWORD'),expiry=String(Date.now()+600000);
  if(!password||password.length<20)throw Error('ADMIN_UNAVAILABLE');
  const auth={origin:'https://brcstudio.es',cookie:'brc_admin='+expiry+'.'+createHmac('sha256',password).update('brc-admin-v1:'+expiry).digest('hex')};
  let action_status=null;
  if(req.method==='POST'){
   const {action}=await req.json();
   const state=await api('test_helpers/test_clocks/'+clock);
   if(state.status!=='ready')return Response.json({clock_status:state.status},{status:409,headers});
   if(action==='renew'){
    const invoices=await api('invoices?'+new URLSearchParams({subscription,limit:'100'}));
    const renewal=invoices.data.find(i=>i.billing_reason==='subscription_cycle');
    if(invoices.has_more||sub.status!=='active'||sub.cancel_at||renewal?.paid)throw Error('RENEWAL_GUARD');
    const end=sub.items.data[0].current_period_end;
    const target=renewal?state.frozen_time+7200:end+7200;
    if(target<=state.frozen_time||target>state.frozen_time+32*86400)throw Error('CLOCK_RANGE');
    await api('test_helpers/test_clocks/'+clock+'/advance',new URLSearchParams({frozen_time:String(target)}));action_status='renewal_clock_advanced';
   }else if(action==='cancel'){
    const invoices=await api('invoices?'+new URLSearchParams({subscription,limit:'100'}));
    if(!invoices.data.some(i=>i.billing_reason==='subscription_cycle'&&i.paid&&i.total===4719))throw Error('PAID_RENEWAL_REQUIRED');
    const c=await api('customers/'+customer);
    if(!c.email?.endsWith('@example.invalid'))throw Error('NON_FIXTURE_CUSTOMER');
    const result=await handleCancellation(new Request('https://brcstudio.es/admin/ventas/bajas-prueba',{method:'POST',headers:auth,body:new URLSearchParams({subscription,email:c.email,evidence:'QA final lifecycle 20261012, synthetic identity and request',password})}),'test');
    if(result.status!==200)throw Error('CANCELLATION_'+result.status);
    action_status='cancellation_handler_confirmed';
   }else if(action==='finish'){
    const ends=[...new Set(sub.items.data.map(i=>i.current_period_end))];
    if(ends.length!==1||!(sub.cancel_at_period_end||sub.cancel_at===ends[0]))throw Error('CANCELLATION_NOT_SCHEDULED');
    const target=ends[0]+4*86400;if(target<=state.frozen_time||target>state.frozen_time+36*86400)throw Error('CLOCK_RANGE');
    await api('test_helpers/test_clocks/'+clock+'/advance',new URLSearchParams({frozen_time:String(target)}));action_status='cancellation_clock_advanced';
   }else throw Error('ACTION_NOT_ALLOWED');
  }
  sub=await api('subscriptions/'+subscription);
  const invoices=await api('invoices?'+new URLSearchParams({subscription,limit:'100'}));
  const store=getStore({name:'brc-order-test-sales',consistency:'strong'});
  const rows=[];
  for(const prefix of ['checkout/','renewal/','invoice-events/','subscription-events/','adjustment-events/']){
   const {blobs}=await store.list({prefix});
   for(const blob of blobs.slice(0,500)){const v=await store.get(blob.key,{type:'json'});if(v?.order_id===order)rows.push({key:blob.key,event:v.stripe_event_id,type:v.event_type,order:v.order_id,seller:v.seller,amount_total:v.amount_total,invoice:v.stripe_invoice_id,subscription:v.stripe_subscription_id,status:v.status,live:v.live})}
  }
  const panel=await sales(new Request('https://brcstudio.es/admin/ventas',{headers:auth}));const html=await panel.text();
  const liveKey=Netlify.env.get('STRIPE_LIVE_SECRET_KEY');let live_tax=null;
  if(/^(sk|rk)_live_/.test(liveKey??'')){
   const r=await fetch('https://api.stripe.com/v1/tax_rates/txr_1UPX5ZDwLerTaplePClmgRMy',{headers:{Authorization:'Bearer '+liveKey}});const t=await r.json();
   live_tax={status:r.status,error_code:t.error?.code,error_type:t.error?.type,permission_denied:/permission/i.test(t.error?.message??''),...(r.ok?{id:t.id,percentage:t.percentage,active:t.active,inclusive:t.inclusive,livemode:t.livemode,country:t.country}:{})};
  }
  const report={checked_at:new Date().toISOString(),action_status,live_disabled:true,webhook_secret_available:!!Netlify.env.get('STRIPE_ORDER_TEST_WEBHOOK_SECRET'),subscription:{id:sub.id,status:sub.status,cancel_at:sub.cancel_at,cancel_at_period_end:sub.cancel_at_period_end,ended_at:sub.ended_at},clock:await api('test_helpers/test_clocks/'+clock),invoices:invoices.data.map(i=>({id:i.id,status:i.status,paid:i.paid,total:i.total,amount_paid:i.amount_paid,amount_remaining:i.amount_remaining,currency:i.currency,billing_reason:i.billing_reason,lines:i.lines.data.map(l=>({amount:l.amount,quantity:l.quantity,description:l.description}))})),ledger:rows,panel:{status:panel.status,contains_order:html.includes(order),events:rows.map(r=>({id:r.event,visible:html.includes(r.event)}))},live_tax};
  report.clock={id:report.clock.id,status:report.clock.status,frozen_time:report.clock.frozen_time};
  return Response.json(report,{headers});
 }catch(e){return Response.json({error:String(e.message).slice(0,180)},{status:409,headers})}
}
export const config={path:'/api/brc-qa-lifecycle',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:20}};
