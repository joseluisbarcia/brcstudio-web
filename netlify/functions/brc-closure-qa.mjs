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
  await journal.setJSON('conditional-probe',{version:1},{onlyIfNew:true});
  const conflict=await journal.setJSON('conditional-probe',{version:2},{onlyIfNew:true});
  progress.atomic_write_verified=conflict.modified===false&&(await journal.get('conditional-probe',{type:'json'})).version===1;
  const testSales=getStore({name:'brc-order-test-sales',consistency:'strong'});
  const fresh=await testSales.get('subscription-events/sub_1UPi3ND95NECz80FUH3JP3x4/evt_1UPjQKD95NECz80FcUhZhgRC',{type:'json'});
  progress.fresh_webhook=fresh?{event:fresh.stripe_event_id,type:fresh.event_type,order:fresh.order_id,seller:fresh.seller,live:fresh.live}:null;
  const panel=await sales(new Request(origin+'/admin/ventas',{headers:auth}));
  const panelText=await panel.text();progress.panel_status=panel.status;progress.panel_contains_fresh_event=panelText.includes('evt_1UPjQKD95NECz80FcUhZhgRC');
  progress.panel_contains_fixture_order=panelText.includes('qa-20261012-subscription');
  const liveKey=Netlify.env.get('STRIPE_LIVE_SECRET_KEY');
  if(/^(sk|rk)_live_/.test(liveKey??'')){
   const tax=await fetch('https://api.stripe.com/v1/tax_rates/txr_1UPX5ZDwLerTaplePClmgRMy',{headers:{Authorization:'Bearer '+liveKey}});
   if(tax.ok){const t=await tax.json();progress.live_tax={id:t.id,active:t.active,livemode:t.livemode,country:t.country,percentage:t.percentage,inclusive:t.inclusive}}
  }
  const binding=await app.get('checkout/'+order,{type:'json'});
  if(!binding){await save({status:'awaiting_customer_acceptance_and_checkout'});return}
  const session=await api('checkout/sessions/'+binding.session_id);
  if(session.livemode!==false||session.metadata?.brc_order_id!==order)throw Error('SESSION_MISMATCH');
  await save({status:session.payment_status==='paid'?'paid_pending_lifecycle_verification':'awaiting_user_sandbox_payment',checkout:session.id,paid:session.payment_status==='paid',subscription:session.subscription});
 }catch(error){await save({status:'blocked',error:String(error.message).slice(0,160)})}
}
export default {
 async deploySucceeded(event){if(Date.now()>1792022400000)return;if(event.site?.id!=='bc101228-ce7b-476f-a44a-16f397eb4736')return;await run()},
 async fetch(req){if(req.method!=='GET')return new Response('',{status:405});const report=await db().get(runKey,{type:'json'});return Response.json(report??{status:'not_started'},{headers:{'cache-control':'no-store','x-robots-tag':'noindex'}})},
 config:{path:'/api/brc-closure-qa-status'}
};

