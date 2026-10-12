import {createHash,createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
import {getStore} from '@netlify/blobs';
export const ORIGIN='https://brcstudio.es';
export const TERMS_VERSION='brc-2026-10-12-v1';
export const hash=s=>createHash('sha256').update(s).digest('hex');
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
export const store=()=>getStore({name:'brc-contracts-v1',consistency:'strong'});
export const amounts=plan=>plan==='compra'?{base:49000,tax:10290,total:59290,renewal:0}:{base:18800,tax:3948,total:22748,renewal:4719};
export function admin(req){
 const password=Netlify.env.get('BRC_ADMIN_PASSWORD');if(!password||password.length<20)return false;
 const token=(req.headers.get('cookie')??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('brc_admin='))?.slice(10)??'';
 const parts=token.split('.');if(parts.length!==2)return false;
 const [expiry,sig]=parts;if(!/^\d{13}$/.test(expiry)||Number(expiry)<=Date.now()||Number(expiry)>Date.now()+1800001||!/^[a-f0-9]{64}$/.test(sig))return false;
 return timingSafeEqual(Buffer.from(sig,'hex'),createHmac('sha256',password).update('brc-admin-v1:'+expiry).digest());
}
export const headers={'content-type':'text/html; charset=utf-8','cache-control':'no-store, private','x-robots-tag':'noindex, nofollow','referrer-policy':'same-origin','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; form-action 'self' https://checkout.stripe.com; base-uri 'none'; frame-ancestors 'none'"};
export const page=(body,status=200)=>new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BRC Studio · Propuesta privada</title><style>body{font:16px system-ui;max-width:800px;margin:30px auto;padding:20px;line-height:1.5}label{display:block;margin:16px 0}input,textarea,select,button{font:inherit;padding:12px;width:100%;box-sizing:border-box}input[type=checkbox]{width:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{display:block;color:#555}</style></head><body>${body}</body></html>`,{status,headers});
export const originOK=req=>new URL(req.url).origin===ORIGIN&&(req.method==='GET'||req.headers.get('origin')===ORIGIN);
export async function issueLink(offer,input,db=store()){
 const signatory=String(input.verified_signatory??'').trim(),phone=String(input.phone??'').trim();
 const identity_reference=String(input.identity_reference??'').trim(),authority_reference=String(input.authority_reference??'').trim();
 if(signatory.length<3||signatory.length>160||!/^\+[1-9][0-9]{7,14}$/.test(phone)||identity_reference.length<10||identity_reference.length>240||authority_reference.length<10||authority_reference.length>240||!['known_contact_call','in_person'].includes(input.verification_method))throw Error('IDENTITY_REVIEW_REQUIRED');
 const token=randomBytes(32).toString('hex'),key=hash(token),now=Date.now();
 const verification={verified_signatory:signatory,phone,identity_reference,authority_reference,verification_method:input.verification_method,verified_by:'direccion',verified_at:new Date(now).toISOString(),channel:'whatsapp_manual',seller:offer.seller};
 await db.setJSON('challenge/'+key,{order_id:offer.id,email:offer.email,terms_hash:offer.terms_hash,expires_at:Math.min(offer.expires_at,now+48*3600000),verification},{onlyIfNew:true});
 await db.setJSON('delivery/'+key,{order_id:offer.id,channel:'whatsapp_manual',status:'link_generated_for_manual_delivery',recorded_at:new Date(now).toISOString(),seller:offer.seller},{onlyIfNew:true});
 return {url:ORIGIN+'/pedido#'+token,token_hash:key};
}
export const normalizedName=s=>String(s??'').normalize('NFKC').trim().toLocaleLowerCase('es').replace(/\s+/g,' ');
export async function customer(token,db=store()){
 if(!/^[a-f0-9]{64}$/.test(token??''))return null;
 const challenge=await db.get('challenge/'+hash(token),{type:'json'});
 if(!challenge||challenge.expires_at<Date.now())return null;
 const delivery=await db.get('delivery/'+hash(token),{type:'json'});
 const offer=await db.get('offer/'+challenge.order_id,{type:'json'});
 const revoked=await db.get('revocation/'+hash(token),{type:'json'});
 if(revoked||!challenge.verification||delivery?.channel!=='whatsapp_manual'||!offer||offer.expires_at<Date.now()||offer.email!==challenge.email||offer.terms_hash!==challenge.terms_hash)return null;
 return {offer,challenge,delivery,token_hash:hash(token)};
}
export function makeOffer(draft,input,now=Date.now()){
 if(!uuid(draft?.id)||!['compra','mensual'].includes(draft.plan)||!['madrid','barcelona','direccion'].includes(draft.seller))throw Error('INVALID_DRAFT');
 const required=['customer_name','customer_tax_id','customer_address','supplier_name','supplier_tax_id','supplier_address','scope','terms'];
 for(const field of required){if(typeof input[field]!=='string'||input[field].trim().length<3||input[field].length>(field==='terms'?20000:field==='scope'?6000:500)||/\[PENDIENTE\]|por definir|TODO/i.test(input[field]))throw Error('INCOMPLETE_PROPOSAL')}
 if(input.tax_scope!=='ES_GENERAL_21'||input.fiscal_review!=='confirmed')throw Error('TAX_REVIEW_REQUIRED');
 if(!['test','live'].includes(input.environment))throw Error('INVALID_ENVIRONMENT');
 const fiscal=Object.fromEntries(required.filter(x=>!['scope','terms'].includes(x)).map(k=>[k,input[k].trim()]));
 const approved=`Modalidad: ${draft.plan}. Compra: 490 EUR + IVA; plan mensual: alta 149 EUR + IVA y primera mensualidad 39 EUR + IVA; renovaciones: únicamente 39 EUR + IVA/mes. IVA de esta propuesta: 21 %, verificado individualmente. Sin permanencia ni penalización. Baja en cualquier momento, efectiva al terminar el período pagado; sin nuevas renovaciones desde la baja efectiva; sin devolución proporcional salvo obligación legal. Canal de baja: jose@brcstudio.es, con confirmación de identidad y confirmación de programación en Stripe. El dominio pertenece al cliente. El plan mensual incluye hasta dos solicitudes manuales mensuales de pequeños ajustes, no acumulables; las incidencias cubiertas no consumen solicitudes. Compra: 30 días de soporte inicial para incidencias de entrega. No se promete Admin de autogestión como disponible.`;
 const offer={id:draft.id,business:draft.business,email:draft.email,plan:draft.plan,seller:draft.seller,environment:input.environment,fiscal,scope:input.scope.trim(),terms:approved+'\n\n'+input.terms.trim(),terms_version:TERMS_VERSION,tax_scope:input.tax_scope,amounts:amounts(draft.plan),created_at:new Date(now).toISOString(),expires_at:now+7*86400000,authorized_by:'direccion'};
 offer.terms_hash=hash(JSON.stringify(offer));return offer;
}
export function renderOffer(o){const eur=n=>(n/100).toFixed(2)+' EUR';return `<h1>Propuesta privada · ${esc(o.business)}</h1><p>Pedido ${esc(o.id)} · ${o.environment==='test'?'PRUEBA — sin contratación real':'Propuesta contractual'}</p><p>Cliente: ${esc(o.fiscal.customer_name)} · ${esc(o.fiscal.customer_tax_id)} · ${esc(o.fiscal.customer_address)}</p><p>Prestador: ${esc(o.fiscal.supplier_name)} · ${esc(o.fiscal.supplier_tax_id)} · ${esc(o.fiscal.supplier_address)}</p><p>Base: ${eur(o.amounts.base)} · IVA: ${eur(o.amounts.tax)} · Total inicial: <strong>${eur(o.amounts.total)}</strong>${o.amounts.renewal?' · Renovaciones: '+eur(o.amounts.renewal)+'/mes':''}</p><h2>Alcance</h2><pre>${esc(o.scope)}</pre><h2>Condiciones</h2><pre>${esc(o.terms)}</pre><small>Versión ${esc(o.terms_version)} · SHA-256 ${esc(o.terms_hash)}</small>`}
