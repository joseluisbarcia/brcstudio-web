import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {getStore} from '@netlify/blobs';

const origin='https://brcstudio.es';
const monthly='price_1UPVEWDwLerTapleCN8WYU7L';
const headers={'content-type':'text/html; charset=utf-8','cache-control':'no-store, private','x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash=s=>createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>timingSafeEqual(Buffer.from(hash(a),'hex'),Buffer.from(hash(b),'hex'));
const page=(body,status=200)=>new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BRC · Bajas</title><style>body{font:16px system-ui;max-width:740px;margin:40px auto;padding:20px}label{display:block;margin:18px 0}input,textarea,button{font:inherit;display:block;width:100%;box-sizing:border-box;padding:10px}small{display:block}</style><h1>Bajas al final del período pagado</h1><p><a href="/admin/ventas">Panel de ventas</a></p>${body}</html>`,{status,headers});
const authenticated=(req,password)=>{
 const cookie=(req.headers.get('cookie')??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('brc_admin='))?.slice(10)??'';
 const parts=cookie.split('.');if(parts.length!==2)return false;
 const [expiry,sig]=parts;
 return /^\d{13}$/.test(expiry)&&Number(expiry)>Date.now()&&Number(expiry)<=Date.now()+1800001&&/^[a-f0-9]{64}$/.test(sig)&&equal(sig,createHmac('sha256',password).update('brc-admin-v1:'+expiry).digest('hex'));
};
export async function handleCancellation(req,mode='live'){
 const live=mode==='live';
 const monthlyPrice=live?monthly:Netlify.env.get('STRIPE_TEST_PRICE_MONTHLY');
 if(!['GET','POST'].includes(req.method))return page('Método no permitido',405);
 if(new URL(req.url).origin!==origin)return page('Host no permitido',403);
 const password=Netlify.env.get('BRC_ADMIN_PASSWORD');
 if(!password||password.length<20||!authenticated(req,password))return page('Acceso privado. Inicia sesión en el panel.',401);
 const store=getStore({name:live?'brc-live-cancellations':'brc-order-test-cancellations',consistency:'strong'});
 if(req.method==='GET'){
  let history;try{const {blobs}=await store.list({prefix:'result/'});history=(await Promise.all(blobs.slice(0,100).map(b=>store.get(b.key,{type:'json'})))).filter(Boolean)}catch{return page('No se pudo consultar el historial.',503)}
  return page(`<h2>${live?'PRODUCCIÓN':'SANDBOX — sin dinero real'}</h2><p>Solo Dirección. Antes de actuar, confirma la solicitud con el titular por su canal conocido y conserva el mensaje o expediente de verificación. Conocer su email no basta para verificar su identidad.</p><p>Esta acción programa una baja en Stripe en el entorno indicado, sin penalización ni devolución proporcional. No se debe usar para pruebas con suscripciones reales.</p><form method="post"><label>Suscripción Stripe<input name="subscription" required pattern="sub_[A-Za-z0-9]+"></label><label>Email del titular verificado<input type="email" name="email" required></label><label>Referencia del mensaje o expediente de identidad verificada<input name="evidence" required minlength="10" maxlength="240"></label><small>Referencia privada trazable; no pegar datos fiscales, contraseñas ni contenido de mensajes.</small><label>Confirmar contraseña de Dirección<input name="password" type="password" autocomplete="current-password" required></label><button>Programar baja al finalizar el período pagado</button></form><h2>Bajas confirmadas por Stripe</h2>${history.map(x=>`<p>${esc(x.subscription)} · ${esc(x.recorded_at)} · Fin previsto: ${esc(x.cancel_at?new Date(x.cancel_at*1000).toISOString():'consultar Stripe')}</p>`).join('')||'<p>Sin bajas registradas.</p>'}`);
 }
 if(req.headers.get('origin')!==origin)return page('Origen no permitido',403);
 let form;try{form=await req.formData()}catch{return page('Solicitud inválida',400)}
 const candidate=String(form.get('password')??'');
 if(candidate.length>1024||!equal(candidate,password))return page('Reautenticación incorrecta',401);
 const subscription=String(form.get('subscription')??''),email=String(form.get('email')??'').trim().toLowerCase(),evidence=String(form.get('evidence')??'').trim();
 if(!/^sub_[A-Za-z0-9]+$/.test(subscription)||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||evidence.length<10||evidence.length>240)return page('Revisa la referencia y los datos.',400);
 const secret=Netlify.env.get(live?'STRIPE_LIVE_SECRET_KEY':'STRIPE_TEST_SECRET_KEY');
 if(!(live?/^(sk|rk)_live_/:/^(sk|rk)_test_/).test(secret??''))return page('Gestión de suscripciones no configurada.',503);
 const api=async(path,body)=>{
  const r=await fetch('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+secret,...(body?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':'brc-cancel-'+mode+'-'+hash(subscription+':'+evidence)}:{})},...(body?{body}:{})});
  if(!r.ok)throw Error('Stripe unavailable');return r.json();
 };
 try{
  const sub=await api('subscriptions/'+subscription+'?expand[]=customer');
  if(sub.livemode!==live||sub.id!==subscription||!sub.items?.data?.some(i=>i.price?.id===monthlyPrice)||sub.items?.has_more||sub.customer?.deleted||sub.customer?.livemode!==live||String(sub.customer?.email??'').trim().toLowerCase()!==email)return page('La suscripción y el titular no coinciden con el plan BRC.',409);
  if(!live&&!sub.metadata?.brc_order_id)return page('Solo se pueden cancelar pruebas creadas por el nuevo flujo de pedidos. Las pruebas anteriores quedan protegidas.',409);
  if(!['active','trialing','past_due'].includes(sub.status))return page('Estado no gestionable aquí. Revisar directamente en Stripe.',409);
  // Immutable intent before the external side effect; retry always sets the same
  // flag to true. This journal has no transactional counters or mutable balances.
  const key=hash(subscription+':'+evidence);
  const intent={environment:mode,subscription,customer:sub.customer.id,evidence,identity_verified_by:'direccion',identity_method:'manual_known_channel',recorded_at:new Date().toISOString()};
  await store.setJSON('request/'+key,intent,{onlyIfNew:true});
  const result=sub.cancel_at_period_end?sub:await api('subscriptions/'+subscription,new URLSearchParams({cancel_at_period_end:'true',proration_behavior:'none'}));
  if(result.id!==subscription||result.livemode!==live||result.cancel_at_period_end!==true)throw Error('Unconfirmed cancellation');
  await store.setJSON('result/'+key,{...intent,cancel_at_period_end:true,cancel_at:result.cancel_at??null},{onlyIfNew:true});
  return page('<p>Baja confirmada por Stripe al final del período pagado. No se ha solicitado reembolso ni cancelación inmediata.</p>');
 }catch{return page('No se puede confirmar el resultado. Consulta Stripe antes de informar al cliente; reintentar con la misma referencia es seguro.',503)}
}
export default req=>handleCancellation(req,'live');
export const config={path:'/admin/ventas/bajas',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:10}};
