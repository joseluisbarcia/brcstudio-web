import {createHash,createHmac,timingSafeEqual,randomUUID} from "node:crypto";
import {getStore} from "@netlify/blobs";

// Internal draft register only. No checkout, no billing, no claim that client accepted.
const secure={"content-type":"text/html; charset=utf-8","cache-control":"no-store, private","x-robots-tag":"noindex, nofollow","x-content-type-options":"nosniff","referrer-policy":"no-referrer","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
const origin="https://brcstudio.es";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const same=(a,b)=>timingSafeEqual(createHash("sha256").update(a).digest(),createHash("sha256").update(b).digest());
const auth=request=>{
 const password=Netlify.env.get("BRC_ADMIN_PASSWORD");
 if(!password||password.length<20)return false;
 const token=(request.headers.get("cookie")??"").split(";").map(x=>x.trim()).find(x=>x.startsWith("brc_admin="))?.slice(10)??"";
 const [expiry,sig]=token.split(".");
 return /^\d{13}$/.test(expiry??"")&&Number(expiry)>Date.now()&&Number(expiry)<Date.now()+1800001&&/^[0-9a-f]{64}$/.test(sig??"")&&same(sig,createHmac("sha256",password).update("brc-admin-v1:"+expiry).digest("hex"));
};
const layout=body=>`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BRC · Pedidos internos</title><style>body{font:16px system-ui;background:#f6f7fa;color:#18243e;margin:0;padding:18px}.wrap{max-width:780px;margin:auto}.box{background:white;padding:22px;border-radius:14px;margin:15px 0}label{display:block;margin-top:12px;font-weight:600}input,select,textarea,button{font:inherit;width:100%;box-sizing:border-box;padding:11px;border:1px solid #abb6c8;border-radius:8px}button{margin-top:18px;background:#18243e;color:white;border:0;cursor:pointer}small,.muted{color:#626d7c}a{color:#2346ad}h1{font-size:25px}.item{border-top:1px solid #ddd;padding:12px 0;overflow-wrap:anywhere}</style></head><body><main class="wrap"><h1>Pedidos internos · BRC Studio</h1><p><a href="/admin/ventas">← Panel de ventas</a></p>${body}</main></body></html>`;
const reply=(msg,status=200)=>new Response(layout(msg),{status,headers:secure});
const validText=(s,max)=>typeof s==="string"&&s.trim().length>0&&s.trim().length<=max&&![...s].some(c=>c.charCodeAt(0)<32&&c!=="\n");
export default async function handler(req){
 if(new URL(req.url).origin!==origin)return reply("Host no permitido",403);
 if(!["GET","POST"].includes(req.method))return reply("Método no permitido",405);
 if(!auth(req))return reply('<section class="box">Acceso privado. <a href="/admin/ventas">Inicia sesión en el panel de ventas</a> y vuelve aquí.</section>',401);
 if(req.method==="POST"){
  const actual=req.headers.get("origin");
  const ref=req.headers.get("referer");
  const fetchSite=req.headers.get("sec-fetch-site");
  let refOK=false;try{refOK=new URL(ref).origin===origin}catch{}
  if(actual&&actual!==origin)return reply("Origen no permitido",403);
  if(!actual&&!refOK&&fetchSite!=="same-origin")return reply("Origen no permitido",403);
  let form;try{form=await req.formData()}catch{return reply("Solicitud inválida",400)}
  const business=String(form.get("business")??"").trim(),email=String(form.get("email")??"").trim().toLowerCase(),
   plan=String(form.get("plan")??""),seller=String(form.get("seller")??""),notes=String(form.get("notes")??"").trim();
  if(!validText(business,120)||!validText(email,180)||!/^\S+@\S+\.\S+$/.test(email)||!["compra","mensual"].includes(plan)||!["madrid","barcelona","direccion"].includes(seller)||notes.length>500)return reply("Revisa los datos del pedido.",400);
  const id=randomUUID(),createdAt=new Date().toISOString();
  // Do not store card data, passwords, fiscal IDs, or imply that the customer has accepted terms.
  const row={id,created_at:createdAt,business,email,plan,seller,notes,status:"borrador_pendiente_de_aceptacion",terms_accepted:false,stripe_session_id:null,stripe_customer_id:null,
    commercial_terms:"docs/PLANTILLA_PROPUESTA_Y_CONDICIONES_BRC_2026-10-12.md",currency:"eur",tax_scope:"IVA_general_ES_pendiente_de_verificacion",
    base_amount_cents:plan==="compra"?49000:18800,vat_amount_cents:plan==="compra"?10290:3948,total_amount_cents:plan==="compra"?59290:22748};
  try{const store=getStore({name:"brc-order-drafts",consistency:"strong"});const res=await store.setJSON("draft/"+id,row,{onlyIfNew:true});if(!res.modified)return reply("No se pudo registrar el borrador",503)}
  catch{return reply("No se pudo guardar el borrador. Inténtalo de nuevo.",503)}
  return new Response(null,{status:303,headers:{"location":"/admin/ventas/pedidos?creado="+encodeURIComponent(id),"cache-control":"no-store"}});
 }
 let entries=[];
 try{const store=getStore({name:"brc-order-drafts",consistency:"strong"});const listing=await store.list({prefix:"draft/"});entries=(await Promise.all(listing.blobs.slice(0,200).map(b=>store.get(b.key,{type:"json"})))).filter(Boolean).sort((a,b)=>b.created_at.localeCompare(a.created_at))}
 catch{return reply("No se pudo consultar el registro.",503)}
 const created=new URL(req.url).searchParams.get("creado");
 const notice=created&&/^[0-9a-f-]{36}$/i.test(created)?'<section class="box">Borrador guardado. No se ha cobrado ni enviado nada al cliente.</section>':"";
 const form=`<section class="box"><h2>Nuevo borrador de pedido</h2><p class="muted">Solo uso interno. La aceptación real del cliente y su identidad fiscal se verificarán antes de cualquier enlace de pago.</p><form method="post" action="/admin/ventas/pedidos"><label for="business">Nombre del negocio</label><input id="business" name="business" required maxlength="120"><label for="email">Correo de contacto</label><input id="email" name="email" type="email" required maxlength="180"><label for="plan">Modalidad</label><select id="plan" name="plan"><option value="compra">Compra: 490 € + IVA (592,90 €)</option><option value="mensual">Plan mensual: 149 € + 39 € / mes + IVA (227,48 € iniciales)</option></select><label for="seller">Responsable</label><select id="seller" name="seller"><option value="madrid">Madrid</option><option value="barcelona">Barcelona</option><option value="direccion">Dirección</option></select><label for="notes">Notas internas (sin datos sensibles)</label><textarea id="notes" name="notes" maxlength="500" rows="2"></textarea><button type="submit">Guardar borrador · sin cobro</button></form></section>`;
 const records=entries.map(x=>`<article class="item"><strong>${esc(x.business)}</strong> · ${esc(x.plan)} · ${esc(x.seller)}<div>${esc(x.email)} · ${esc(x.created_at)}</div><small>ID ${esc(x.id)} · <a href="/admin/ventas/contratos?id=${esc(x.id)}">Propuesta, aceptación y Stripe</a></small></article>`).join("");
 return reply(notice+form+`<section class="box"><h2>Borradores (${entries.length})</h2><p class="muted">Registro operativo; no es facturación ni prueba de consentimiento. Hasta 200 registros visibles.</p>${records||"<p>Sin pedidos todavía.</p>"}</section>`);
}
export const config={path:"/admin/ventas/pedidos",rateLimit:{action:"rate_limit",aggregateBy:"ip",windowSize:60,windowLimit:20}};
