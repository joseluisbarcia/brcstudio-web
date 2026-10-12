import {getStore} from '@netlify/blobs';
import {admin,originOK,page,esc,uuid,store,makeOffer,renderOffer,invite,mailReady} from '../lib/orders.mjs';
export default async function(req){
 if(!['GET','POST'].includes(req.method))return page('Método no permitido',405);
 if(!originOK(req))return page('Origen no permitido',403);
 if(!admin(req))return page('Acceso privado. Inicia sesión en el panel.',401);
 let form;try{form=req.method==='POST'?await req.formData():new URL(req.url).searchParams}catch{return page('Solicitud inválida',400)}
 const id=String(form.get('id')??'');if(!uuid(id))return page('Identificador inválido',400);
 try{
  const db=store(),draft=await getStore({name:'brc-order-drafts',consistency:'strong'}).get('draft/'+id,{type:'json'});
  if(!draft)return page('Pedido inexistente',404);
  let offer=await db.get('offer/'+id,{type:'json'});
  if(req.method==='POST'){
   if(form.get('action')==='prepare'){
    if(offer)return page('La propuesta ya es inmutable. Crea otro borrador para una propuesta distinta.',409);
    try{offer=makeOffer(draft,Object.fromEntries(form))}catch{return page('Completa los datos fiscales, alcance, condiciones y revisión de IVA. Solo se admite el supuesto ES general 21 % verificado.',400)}
    const saved=await db.setJSON('offer/'+id,offer,{onlyIfNew:true});if(!saved.modified)return page('Ya existe una propuesta para este pedido.',409);
   }else if(form.get('action')==='send'){
    if(!offer||offer.expires_at<Date.now())return page('Propuesta inexistente o caducada',409);
    if(!mailReady())return page('Verificación por correo no configurada. No se ha enviado nada ni aceptado el pedido.',503);
    await invite(offer,db);
   }else return page('Acción desconocida',400);
   return new Response(null,{status:303,headers:{location:'/admin/ventas/contratos?id='+id,'cache-control':'no-store'}});
  }
  const back='<p><a href="/admin/ventas/pedidos">Pedidos</a></p>';
  if(offer){
   const acceptance=await db.get('acceptance/'+id,{type:'json'}),binding=await db.get('checkout/'+id,{type:'json'});
   let payment='Sin pago confirmado';
   if(binding){
    const secret=Netlify.env.get(offer.environment==='test'?'STRIPE_TEST_SECRET_KEY':'STRIPE_LIVE_SECRET_KEY');
    if(secret){
     const response=await fetch('https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(binding.session_id),{headers:{Authorization:'Bearer '+secret}});
     if(!response.ok)throw Error('STRIPE_UNAVAILABLE');
     const session=await response.json();
     if(session.metadata?.brc_order_id!==offer.id||session.livemode!==(offer.environment==='live'))throw Error('STRIPE_MISMATCH');
     payment=session.payment_status==='paid'&&session.status==='complete'?'Pagado y confirmado en Stripe':session.status+' / '+session.payment_status;
    }else payment='Pendiente de conciliación: clave no disponible';
   }
   return page(back+renderOffer(offer)+`<h2>Estado</h2><p>Aceptación: ${acceptance?esc(acceptance.accepted_at)+' · '+esc(acceptance.signatory):'Pendiente del cliente'}</p><p>Stripe: ${esc(binding?.session_id??'Sin sesión')}</p><p>Resultado: ${esc(payment)}</p><p>Correo de verificación: ${mailReady()?'configurado':'pendiente de configurar Zoho SMTP'}</p><form method="post"><input type="hidden" name="id" value="${id}"><input type="hidden" name="action" value="send"><button>Enviar propuesta y verificación al correo del cliente</button></form><p>El administrador no puede marcar ni registrar la aceptación en esta pantalla.</p>`);
  }
  return page(back+`<h1>Preparar propuesta · ${esc(draft.business)}</h1><p>Correo del destinatario: ${esc(draft.email)}. Comercial: ${esc(draft.seller)}. Modalidad: ${esc(draft.plan)}.</p><form method="post"><input type="hidden" name="id" value="${id}"><input type="hidden" name="action" value="prepare"><label>Entorno<select name="environment"><option value="test">Sandbox — sin contrato real</option><option value="live">Producción — Checkout bloqueado</option></select></label>${[['customer_name','Razón social del cliente'],['customer_tax_id','NIF del cliente'],['customer_address','Domicilio fiscal del cliente'],['supplier_name','Nombre fiscal del prestador'],['supplier_tax_id','NIF del prestador'],['supplier_address','Domicilio fiscal del prestador']].map(([k,l])=>`<label>${l}<input name="${k}" required maxlength="500"></label>`).join('')}<label>Alcance concreto, entregables, plazos y dependencias<textarea name="scope" required maxlength="6000" rows="6"></textarea></label><label>Condiciones complementarias finales y privacidad (sin campos pendientes)<textarea name="terms" required maxlength="20000" rows="10"></textarea></label><label>Tratamiento fiscal<select name="tax_scope"><option value="">Selecciona tras revisión</option><option value="ES_GENERAL_21">Operación sujeta al IVA español general del 21 %</option></select></label><label><input type="checkbox" name="fiscal_review" value="confirmed" required> Dirección ha comprobado el supuesto fiscal de este cliente. No es aceptación del cliente.</label><button>Guardar propuesta inmutable · sin envío ni cobro</button></form>`);
 }catch{return page('No se pudo completar la operación. No se confirma envío ni aceptación.',503)}
}
export const config={path:'/admin/ventas/contratos',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:10}};
