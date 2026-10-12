import {page,originOK,store,customer,renderOffer,esc,hash,normalizedName,admin} from '../lib/orders.mjs';
export const CONSENT='He revisado y acepto expresamente esta propuesta, su alcance, importe con IVA, condiciones y, cuando corresponde, renovaciones mensuales y cancelación al finalizar el período pagado.';
export default async function(req){
 if(!['GET','POST'].includes(req.method))return page('Método no permitido',405);
 if(!originOK(req))return page('Origen no permitido',403);
 if(req.method==='GET')return page('<h1>Propuesta privada de BRC Studio</h1><p id="message">Abre el enlace privado recibido por WhatsApp para revisar la propuesta.</p><form id="access" method="post"><input type="hidden" name="token" id="token"><input type="hidden" name="action" value="view"><button id="open" hidden>Revisar propuesta</button></form><script src="/brc-order-access.js" defer></script>');
 let form;try{form=await req.formData()}catch{return page('Solicitud inválida',400)}
 const token=String(form.get('token')??'');
 try{
  const db=store(),identity=await customer(token,db);if(!identity)return page('Enlace inválido o caducado. Solicita una nueva verificación a BRC Studio.',401);
  const {offer}=identity,action=form.get('action');
  if(!['view','accept'].includes(action))return page('Acción inválida',400);
  if(action==='accept'){
   if(admin(req))return page('La sesión administrativa no puede aceptar como cliente.',403);
   const signatory=String(form.get('signatory')??'').trim();
   if(form.get('consent')!=='accepted'||form.get('terms_hash')!==offer.terms_hash||signatory.length<3||signatory.length>160||form.get('authority')!=='confirmed'||normalizedName(signatory)!==normalizedName(identity.challenge.verification.verified_signatory))return page('Debes identificarte y aceptar expresamente la propuesta mostrada.',400);
   await db.setJSON('acceptance/'+offer.id,{order_id:offer.id,terms_hash:offer.terms_hash,terms_version:offer.terms_version,accepted_at:new Date().toISOString(),signatory,consent:CONSENT,email:offer.email,identity_method:'independent_manual_verification_and_customer_declaration',authority_declaration:true,identity_verification:identity.challenge.verification,challenge_hash:identity.token_hash,delivery_channel:identity.delivery.channel,user_agent:req.headers.get('user-agent')?.slice(0,300)??'',environment:offer.environment},{onlyIfNew:true});
  }
  const acceptance=await db.get('acceptance/'+offer.id,{type:'json'});
  if(acceptance&&acceptance.terms_hash!==offer.terms_hash)return page('Inconsistencia de propuesta. Contacta con BRC.',409);
  const accepted=acceptance?`<p>Aceptación registrada el ${esc(acceptance.accepted_at)} por ${esc(acceptance.signatory)}. Identidad y facultades revisadas por BRC por un canal independiente. La posesión de este enlace no acredita por sí sola representación legal.</p>${offer.environment==='test'?`<form method="post" action="/api/brc-order-checkout"><input type="hidden" name="token" value="${esc(token)}"><button>Abrir Checkout de prueba · sin dinero real</button></form>`:'<p>Los pagos reales permanecen desactivados. No hay enlace de pago disponible.</p>'}`:`<form method="post"><input type="hidden" name="action" value="accept"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="terms_hash" value="${offer.terms_hash}"><label>Nombre y apellidos de quien acepta, con representación del cliente<input name="signatory" required maxlength="160"></label><label><input type="checkbox" name="authority" value="confirmed" required> Declaro que soy la persona identificada y que soy titular del negocio o dispongo de facultades suficientes para contratar en su nombre.</label><label><input type="checkbox" name="consent" value="accepted" required> ${CONSENT}</label><button>Aceptar expresamente · sin cobro</button></form>`;
  return page(renderOffer(offer)+accepted);
 }catch{return page('No se pudo confirmar el registro. Inténtalo de nuevo.',503)}
}
export const config={path:'/pedido',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:20}};
