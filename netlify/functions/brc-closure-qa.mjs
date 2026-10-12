import {getStore} from '@netlify/blobs';
import {createHmac,publicEncrypt,constants} from 'node:crypto';
import contracts from './brc-admin-contracts.mjs';
import sales from './brc-admin-sales.mjs';
const order='a237bc13-84a9-49e4-a197-60a552ff1078';
const clock='clock_1UPi2WD95NECz80FjPrX6YHR';
const customer='cus_VQZBRQdNADjeOj';
const publicKey="-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAkIIRMtGperynhma7kZJo\n9cWAphpP8SlUlrgf0uAamj8rf3kun/D3aFJrXPGzS12RJYAyQWNCpMY9huk7v9T5\nPf968FhXlkuMQXI3qOss6vpXwUaJBEszI2fnFV5dlSeFeeX6lIbyppczwyegAI4A\nk/bRyFMO+f2c84Rvs+cjCcoL8/bdqzYFoqAkPeeZWdZGn360S91bpGkwdEVMNEZh\nKVwNc2nDT54BNKhhfsM6tA0KlGnoho3ejWGFzzuZUAFo/hMDhW+dCrTRz2Mm9m0o\nIMbDgdQM6stmQyojEDx1mel1ZhrmuW4yzHDeLOdkOQVSnH25rE4gKzYOf0KuE6nB\niOedWI1xg0pqlX86eFww77F1NY8g1FPsPXGEJnYe8wxRp8hLvZ8Fz1O5xenMXUYZ\njYrP/T9hJy3YmViI+Awy1z4C6QmqdhHY+NdLj29SynO2JhnxWEHgyFKnhkZ9DoBs\nEABuYm1mF40GOO5M8ypKDUARI7YRk2N0BkYJXPxQOw45AgMBAAE=\n-----END PUBLIC KEY-----";
const db=()=>getStore({name:'brc-closure-qa',consistency:'strong'});
const origin='https://brcstudio.es';
const runKey='whatsapp-20261012-v1';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
 const journal=db();
 const secret=Netlify.env.get('STRIPE_TEST_SECRET_KEY');
 const adminSecret=Netlify.env.get('BRC_ADMIN_PASSWORD');
 const progress={order,live_flag_disabled:Netlify.env.get('BRC_LIVE_CHECKOUT_ENABLED')!=='true',webhook_configured:!!Netlify.env.get('STRIPE_ORDER_TEST_WEBHOOK_SECRET')?.startsWith('whsec_')};
 const save=async extra=>{Object.assign(progress,extra);await journal.setJSON(runKey,progress)};
 try{
  if(!/^(sk|rk)_test_/.test(secret??'')||!adminSecret||adminSecret.length<20)throw Error('CONFIGURATION_MISSING');
  const api=async(path,body)=>{
   const response=await fetch('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+secret,'Stripe-Version':'2026-09-30.endive',...(body?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':'brc-closure-qa-'+path+'-'+body.toString()}:{})},...(body?{body}:{})});
   if(!response.ok)throw Error('STRIPE_'+response.status+'_'+path.split('?')[0]);return response.json();
  };
  const account=await api('account');if(account.id!=='acct_1UPRtoD95NECz80F')throw Error('WRONG_ACCOUNT');
  const expiry=String(Date.now()+600000),mac=createHmac('sha256',adminSecret).update('brc-admin-v1:'+expiry).digest('hex');
  const auth={origin,cookie:'brc_admin='+expiry+'.'+mac};
  const app=getStore({name:'brc-contracts-v1',consistency:'strong'});
  const old=await journal.get(runKey,{type:'json'});if(old)for(const k of ['capsule','renewal_invoice','renewal_total','renewal_paid'])if(old[k]!==undefined)progress[k]=old[k];
  const request=body=>new Request(origin+'/admin/ventas/contratos',{method:'POST',headers:auth,body:new URLSearchParams({id:order,...body})});
  if(!await app.get('offer/'+order,{type:'json'})){
   await getStore({name:'brc-order-drafts',consistency:'strong'}).setJSON('draft/'+order,{id:order,business:'BRC QA WHATSAPP — SIN VALIDEZ FISCAL',email:'brc-qa-20261012@example.invalid',plan:'mensual',seller:'direccion',created_at:new Date().toISOString()},{onlyIfNew:true});
   const result=await contracts(request({action:'prepare',environment:'test',customer_name:'BRC QA Customer',customer_tax_id:'TEST ONLY',customer_address:'TEST ADDRESS',supplier_name:'BRC QA Supplier',supplier_tax_id:'TEST ONLY',supplier_address:'TEST ADDRESS',scope:'QA sandbox: no real service or contract.',terms:'QA sandbox fixture: no legal validity.',tax_scope:'ES_GENERAL_21',fiscal_review:'confirmed'}));
   if(result.status!==303)throw Error('PROPOSAL_'+result.status);
  }
  await app.setJSON('test-customer/'+order,{customer,clock,qa:true},{onlyIfNew:true});
  if(!progress.capsule){
   const response=await contracts(request({action:'issue',verified_signatory:'BRC QA Firmante',phone:'+34910000000',verification_method:'known_contact_call',identity_reference:'QA fixture identity: no real person',authority_reference:'QA fixture authority: no real representation'}));
   const html=await response.text(),link=html.match(/https:\/\/brcstudio\.es\/pedido#[a-f0-9]{64}/)?.[0];
   if(response.status!==200||!link)throw Error('LINK_'+response.status);
   progress.capsule=publicEncrypt({key:publicKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(link)).toString('base64');
  }
  const binding=await app.get('checkout/'+order,{type:'json'});
  if(!binding){await save({status:'awaiting_customer_acceptance_and_checkout'});return}
  const session=await api('checkout/sessions/'+binding.session_id);
  if(session.livemode!==false||session.metadata?.brc_order_id!==order)throw Error('SESSION_MISMATCH');
  await save({checkout:session.id,paid:session.payment_status==='paid',subscription:session.subscription});
  if(session.payment_status!=='paid'){await save({status:'awaiting_payment'});return}
  const receipt=await getStore({name:'brc-order-test-sales',consistency:'strong'}).get('checkout/'+session.id,{type:'json'});
  progress.receipt_persisted=!!receipt;progress.receipt_event=receipt?.stripe_event_id??null;
  const panel=await sales(new Request(origin+'/admin/ventas',{headers:auth}));
  progress.panel_contains_order=(await panel.text()).includes(order);
  if(!receipt){await save({status:'awaiting_signed_webhook'});return}
  const subId=session.subscription;if(!/^sub_/.test(subId??''))throw Error('SUBSCRIPTION_MISSING');
  let sub=await api('subscriptions/'+subId);
  if(sub.livemode!==false||sub.metadata?.brc_order_id!==order||sub.test_clock!==clock)throw Error('SUBSCRIPTION_MISMATCH');
  const advance=async target=>{
   const current=await api('test_helpers/test_clocks/'+clock);
   if(current.frozen_time<target)await api('test_helpers/test_clocks/'+clock+'/advance',new URLSearchParams({frozen_time:String(target)}));
   for(let n=0;n<50;n++){const state=await api('test_helpers/test_clocks/'+clock);if(state.status==='ready')return;await wait(4000)}
   throw Error('CLOCK_TIMEOUT');
  };
  if(sub.status!=='canceled'&&!sub.cancel_at_period_end){
   if(!progress.renewal_paid)await advance(sub.items.data[0].current_period_end+4*86400);
   sub=await api('subscriptions/'+subId);
   const invoice=await api('invoices/'+sub.latest_invoice);
   if(invoice.billing_reason!=='subscription_cycle'||invoice.status!=='paid'||invoice.total!==4719)throw Error('RENEWAL_NOT_CONFIRMED');
   await save({renewal_invoice:invoice.id,renewal_total:invoice.total,renewal_paid:true});
   await subCancel();
  }
  async function subCancel(){
   const result=await api('subscriptions/'+subId,new URLSearchParams({cancel_at_period_end:'true',proration_behavior:'none'}));
   if(!result.cancel_at_period_end)throw Error('CANCELLATION_NOT_CONFIRMED');sub=result;
  }
  if(sub.status!=='canceled')await advance(sub.items.data[0].current_period_end+4*86400);
  sub=await api('subscriptions/'+subId);
  if(sub.status!=='canceled')throw Error('CANCELLATION_NOT_EFFECTIVE');
  const invoices=await api('invoices?'+new URLSearchParams({subscription:subId,limit:'100'}));
  const totals=invoices.data.map(i=>({id:i.id,total:i.total,status:i.status,billing_reason:i.billing_reason}));
  await save({status:'complete',cancellation_effective:true,invoice_count:totals.length,invoices:totals});
 }catch(error){await save({status:'blocked',error:String(error.message).slice(0,160)})}
}
export default {
 async deploySucceeded(event){if(Date.now()>1792022400000)return;if(event.site?.id!=='bc101228-ce7b-476f-a44a-16f397eb4736')return;await run()},
 async fetch(req){if(req.method!=='GET')return new Response('',{status:405});const report=await db().get(runKey,{type:'json'});return Response.json(report??{status:'not_started'},{headers:{'cache-control':'no-store','x-robots-tag':'noindex'}})},
 config:{path:'/api/brc-closure-qa-status'}
};

