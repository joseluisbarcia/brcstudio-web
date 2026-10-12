import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import * as crypto from 'node:crypto';
const root=resolve('netlify/functions'),password=crypto.randomBytes(32).toString('hex'),id='e937f213-00a4-44e9-b858-dd9803de4732';
async function system(){
 const buckets=new Map(),sent=[],calls=[];
 const getStore=({name})=>{if(!buckets.has(name))buckets.set(name,new Map());const rows=buckets.get(name);return {async get(k){return rows.get(k)??null},async setJSON(k,v,o){assert.equal(o.onlyIfNew,true);if(rows.has(k))return {modified:false};rows.set(k,structuredClone(v));return {modified:true}}}};
 const env={BRC_ADMIN_PASSWORD:password,BRC_SMTP_HOST:'smtp.zoho.eu',BRC_SMTP_USER:'jose@brcstudio.es',BRC_SMTP_PASSWORD:'fixture',STRIPE_TEST_SECRET_KEY:'rk_test_fixture',STRIPE_TEST_TAX_RATE:'txr_fixture',STRIPE_TEST_PRICE_PURCHASE:'price_fixture'};
 const context=vm.createContext({Request,Response,URL,URLSearchParams,Buffer,Date,console,Netlify:{env:{get:k=>env[k]}},fetch:async(url,options)=>{
  calls.push({url,...options});if(url.includes('/tax_rates/'))return Response.json({active:true,inclusive:false,percentage:21,country:'ES',livemode:false});
  return Response.json({livemode:false,id:'cs_test_routefixture',url:'https://checkout.stripe.com/c/pay/fixture',amount_total:59290,currency:'eur',metadata:{brc_order_id:id},status:'open'});
 }});
 const cache=new Map();
 const moduleFor=path=>{
  if(cache.has(path))return cache.get(path);
  let mod;
  if(path==='node:crypto'||path==='@netlify/blobs'||path==='nodemailer'){
   const values=path==='node:crypto'?crypto:path==='@netlify/blobs'?{getStore}:{default:{createTransport:()=>({async sendMail(m){sent.push(m);return {accepted:[m.to],messageId:'message_fixture'}},close(){}})}};
   mod=new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v)},{context,identifier:path});
  }else mod=new vm.SourceTextModule(readFileSync(path,'utf8'),{context,identifier:path});
  cache.set(path,mod);return mod;
 };
 const load=async filename=>{const mod=moduleFor(resolve(root,filename));if(mod.status==='unlinked')await mod.link((name,from)=>moduleFor(name.startsWith('.')?resolve(dirname(from.identifier),name):name));if(mod.status==='linked')await mod.evaluate();return mod.namespace.default};
 const exp=String(Date.now()+600000),sig=crypto.createHmac('sha256',password).update('brc-admin-v1:'+exp).digest('hex');
 const req=(path,body,admin=false)=>new Request('https://brcstudio.es'+path,{method:'POST',headers:{origin:'https://brcstudio.es',...(admin?{cookie:`brc_admin=${exp}.${sig}`}:{})},body:new URLSearchParams(body)});
 getStore({name:'brc-order-drafts'});buckets.get('brc-order-drafts').set('draft/'+id,{id,business:'TEST fixture',email:'fixture@example.invalid',plan:'compra',seller:'madrid'});
 return {load,req,buckets,sent,calls,env};
}
test('HTTP workflow: private proposal → email possession → explicit consent → bound sandbox Checkout',async()=>{
 const s=await system(),admin=await s.load('brc-admin-contracts.mjs'),customer=await s.load('brc-customer-order.mjs'),checkout=await s.load('brc-order-checkout.mjs');
 const data={id,action:'prepare',environment:'test',customer_name:'TEST Customer',customer_tax_id:'TEST ONLY',customer_address:'TEST Address',supplier_name:'TEST Supplier',supplier_tax_id:'TEST ONLY',supplier_address:'TEST Address',scope:'TEST scope only',terms:'TEST terms only',tax_scope:'ES_GENERAL_21',fiscal_review:'confirmed'};
 assert.equal((await admin(s.req('/admin/ventas/contratos',data))).status,401);
 assert.equal((await admin(s.req('/admin/ventas/contratos',data,true))).status,303);
 assert.equal((await admin(s.req('/admin/ventas/contratos',data,true))).status,409);
 assert.equal((await admin(s.req('/admin/ventas/contratos',{id,action:'send'},true))).status,303);
 assert.equal(s.sent.length,1);const token=s.sent[0].text.match(/\/pedido#([a-f0-9]{64})/)[1];
 const offer=s.buckets.get('brc-contracts-v1').get('offer/'+id);
 assert.equal((await checkout(s.req('/api/brc-order-checkout',{token}))).status,403);
 assert.equal(s.calls.length,0);
 assert.equal((await customer(s.req('/pedido',{action:'accept',token,signatory:'Fixture Signatory',terms_hash:offer.terms_hash}))).status,400);
 const response=await customer(s.req('/pedido',{action:'accept',token,signatory:'Fixture Signatory',terms_hash:offer.terms_hash,consent:'accepted'}));assert.equal(response.status,200);
 const acceptance=s.buckets.get('brc-contracts-v1').get('acceptance/'+id);assert.equal(acceptance.identity_method,'email_link_possession');assert.equal(acceptance.delivery_message_id,'message_fixture');
 const pay=await checkout(s.req('/api/brc-order-checkout',{token}));assert.equal(pay.status,303);assert.match(pay.headers.get('location'),/^https:\/\/checkout.stripe.com/);
 const post=s.calls.find(x=>x.method==='POST');assert.equal(post.body.get('metadata[brc_order_id]'),id);
});
test('SMTP not configured cannot expose a customer token or claim delivery',async()=>{
 const s=await system();delete s.env.BRC_SMTP_PASSWORD;
 const admin=await s.load('brc-admin-contracts.mjs');s.buckets.set('brc-contracts-v1',new Map([['offer/'+id,{id,expires_at:Date.now()+10000}]]));
 const response=await admin(s.req('/admin/ventas/contratos',{id,action:'send'},true));assert.equal(response.status,503);assert.equal(s.sent.length,0);
});
