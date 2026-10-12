import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

// Test-only admin. Requires a long secret configured as BRC_ADMIN_PASSWORD in Netlify.
const headers = {"content-type":"text/html; charset=utf-8","cache-control":"no-store, private","x-robots-tag":"noindex, nofollow","x-content-type-options":"nosniff","referrer-policy":"no-referrer","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
const esc = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeEqual = (a,b) => {const x=createHash("sha256").update(a).digest(),y=createHash("sha256").update(b).digest();return timingSafeEqual(x,y)};
const mac = (value,password) => createHmac("sha256",password).update("brc-admin-v1:"+value).digest("hex");
const page = (body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BRC Studio · Panel de ventas</title><style>body{font:16px system-ui,sans-serif;background:#f6f7fa;color:#18243e;margin:0;padding:28px 16px}.wrap{max-width:900px;margin:auto}h1{font-size:27px}p{line-height:1.6}.box{background:white;padding:24px;border-radius:14px;box-shadow:0 2px 18px #18243e12;margin:18px 0}input,button{font:inherit;padding:12px;border-radius:8px}input{width:100%;box-sizing:border-box;border:1px solid #aab2c2}button{border:0;background:#18243e;color:white;cursor:pointer;margin-top:12px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #ddd;word-break:break-word}small{color:#586274}.scroll{overflow-x:auto}a{color:#294ac2}.sale-card{border:1px solid #e1e5ed;border-radius:12px;padding:18px;margin-top:14px}.sale-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.sale-amount{font-size:23px;font-weight:700}.sale-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}.sale-label{display:block;color:#586274;font-size:12px;margin-bottom:5px}.sale-id{overflow-wrap:anywhere;font-size:12px;color:#586274;margin-top:14px}.desktop-sales{display:block}.mobile-sales{display:none}@media(max-width:650px){body{padding:22px 14px}h1{font-size:25px;line-height:1.2}.box{padding:20px}.desktop-sales{display:none}.mobile-sales{display:block}.sale-grid{grid-template-columns:1fr 1fr}}</style></head><body><main class="wrap"><h1>BRC Studio · Panel de ventas</h1><p>Panel privado · Producción y pruebas separadas. <a href="/admin/ventas/pedidos">Pedidos internos (sin cobros)</a> · <a href="/admin/ventas/bajas">Gestionar bajas</a></p>${body}</main></body></html>`;
const reply=(body,status=200,extra={})=>new Response(page(body),{status,headers:{...headers,...extra}});
export default async function(request){
  const password=Netlify.env.get("BRC_ADMIN_PASSWORD");
  if (!password || password.length<20) return reply("<div class=box>Panel pendiente de activar. Configura una contraseña de al menos 20 caracteres en Netlify (BRC_ADMIN_PASSWORD) y vuelve a desplegar.</div>",503);
  const url=new URL(request.url);
  if(request.method==="POST"){
    const origin=request.headers.get("origin");
    const referer=request.headers.get("referer");
    const fetchSite=request.headers.get("sec-fetch-site");
    const allowed="https://brcstudio.es";
    // Browsers may omit Origin on same-site form POST. Accept same-origin Referer or Fetch Metadata as fallback.
    const sameOriginReferer=(()=>{try{return new URL(referer).origin===allowed}catch{return false}})();
    const sameOriginFetch=fetchSite==="same-origin";
    if(origin!==allowed && !sameOriginReferer && !sameOriginFetch) return reply("<div class=box>Origen no permitido.</div>",403);
    if(origin && origin!=="null" && origin!==allowed) return reply("<div class=box>Origen no permitido.</div>",403);
    const form=await request.formData();
    if(form.get("action")==="logout")return new Response(null,{status:303,headers:{location:url.pathname,"set-cookie":"brc_admin=; Path=/admin/ventas; HttpOnly; Secure; SameSite=Strict; Max-Age=0","cache-control":"no-store"}});
    const candidate=String(form.get("password")??"");
    if(candidate.length>1024||!safeEqual(candidate,password))return reply("<div class=box>Contraseña incorrecta. <a href='/admin/ventas'>Volver</a></div>",401);
    const expires=Date.now()+30*60*1000;
    const token=String(expires)+"."+mac(String(expires),password);
    return new Response(null,{status:303,headers:{location:url.pathname,"set-cookie":`brc_admin=${token}; Path=/admin/ventas; HttpOnly; Secure; SameSite=Strict; Max-Age=1800`,"cache-control":"no-store"}});
  }
  if(request.method!=="GET")return reply("Método no permitido",405);
  const cookie=(request.headers.get("cookie")??"").split(";").map(x=>x.trim()).find(x=>x.startsWith("brc_admin="))?.slice(10)??"";
  const [expiry,signature]=cookie.split(".");
  const valid=/^\d{13}$/.test(expiry??"")&&Number(expiry)>Date.now()&&Number(expiry)<Date.now()+1800001&&/^[a-f0-9]{64}$/.test(signature??"")&&safeEqual(signature,mac(expiry,password));
  if(!valid)return reply("<div class=box><form method=post action='/admin/ventas'><label for=p>Contraseña de administración</label><input id=p name=password type=password autocomplete=current-password required><button type=submit>Entrar</button></form></div>");
  try{
    const store=getStore("brc-test-sales");
    const {blobs}=await store.list({prefix:"checkout/"});
    const items=(await Promise.all(blobs.slice(0,500).map(b=>store.get(b.key,{type:"json"})))).filter(Boolean).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    // Live ledger is isolated from sandbox. Read-only: never initiates payments.
    const liveStore=getStore({name:"brc-live-sales",consistency:"strong"});
    const livePrefixes=["checkout/","renewal/","invoice-events/","subscription-events/"];
    const liveGroups=await Promise.all(livePrefixes.map(async prefix=>{
      const {blobs}=await liveStore.list({prefix});
      return Promise.all(blobs.slice(0,500).map(b=>liveStore.get(b.key,{type:"json"})));
    }));
    const liveCheckouts=liveGroups[0].filter(Boolean).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const liveRenewals=liveGroups[1].filter(Boolean).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const liveIncidents=liveGroups[2].filter(Boolean).filter(e=>e.event_type!=="invoice.paid").sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const liveSubscriptions=liveGroups[3].filter(Boolean).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const euro=cents=>(Number(cents||0)/100).toLocaleString("es-ES",{style:"currency",currency:"EUR"});
    const ledger=(entries,type)=>entries.map(s=>`<article class="sale-card"><div class="sale-head"><strong>${esc(type==="checkout"?(s.plan==="compra"?"Compra de web":"Alta y plan mensual"):type==="renewal"?"Renovación mensual":s.event_type)}</strong><span class="sale-amount">${type==="checkout"||type==="renewal"?euro(s.amount_total):esc(s.status??"Evento")}</span></div><div class="sale-grid"><div><span class="sale-label">Evento UTC</span>${esc(s.created_at)}</div><div><span class="sale-label">Estado</span>${esc(s.status??s.event_type)}</div></div><div class="sale-id">${esc(s.checkout_id??s.stripe_invoice_id??s.stripe_subscription_id??"")}</div></article>`).join("");
    const liveTotal=liveCheckouts.reduce((sum,s)=>sum+Number(s.amount_total||0),0)+liveRenewals.reduce((sum,s)=>sum+Number(s.amount_total||0),0);
    const liveHtml=`<section class="box"><h2>Producción · registro de Stripe</h2><p>Solo lectura. No activa cobros ni constituye contabilidad. Conciliar con Stripe antes de entregar servicios o tramitar impagos.</p><p><strong>${liveCheckouts.length} compras/altas · ${liveRenewals.length} renovaciones</strong> · Total de eventos de cobro registrados: ${euro(liveTotal)}</p><small>Máximo 500 registros por categoría. Las cifras no descuentan reembolsos ni disputas.</small><h3>Compras y altas</h3>${ledger(liveCheckouts,"checkout")||"<p>Sin ventas reales registradas.</p>"}<h3>Renovaciones</h3>${ledger(liveRenewals,"renewal")||"<p>Sin renovaciones registradas.</p>"}<h3>Incidencias de facturación</h3>${ledger(liveIncidents,"incident")||"<p>Sin incidencias registradas.</p>"}<h3>Historial de suscripciones</h3>${ledger(liveSubscriptions,"subscription")||"<p>Sin eventos registrados.</p>"}</section>`;
    const total=items.reduce((sum,s)=>sum+(Number(s.amount_total)||0),0);
    const rows=items.map(s=>`<tr><td>${esc(s.created_at?.slice(0,16).replace("T"," "))}</td><td>${esc(s.plan)}</td><td>${(Number(s.amount_total)/100).toLocaleString("es-ES",{style:"currency",currency:"EUR"})}</td><td><small>${esc(s.checkout_id)}</small></td></tr>`).join("");
    const cards=items.map(s=>`<article class="sale-card"><div class="sale-head"><strong>${esc(s.plan==="compra"?"Compra de web":s.plan==="mensual"?"Plan mensual":s.plan)}</strong><span class="sale-amount">${(Number(s.amount_total)/100).toLocaleString("es-ES",{style:"currency",currency:"EUR"})}</span></div><div class="sale-grid"><div><span class="sale-label">Fecha (UTC)</span>${esc(s.created_at?.slice(0,16).replace("T"," "))}</div><div><span class="sale-label">Estado</span>Pago de prueba</div></div><div class="sale-id"><span class="sale-label">Stripe Checkout</span>${esc(s.checkout_id)}</div></article>`).join("");
    return reply(`${liveHtml}<div class=box><strong>${items.length} ventas de prueba</strong><p>Importe simulado: ${(total/100).toLocaleString("es-ES",{style:"currency",currency:"EUR"})}. Máximo 500 registros visibles.</p><form method=post action='/admin/ventas'><input type=hidden name=action value=logout><button type=submit>Cerrar sesión</button></form></div><div class="box scroll desktop-sales"><table><thead><tr><th>Fecha UTC</th><th>Modalidad</th><th>Importe</th><th>Stripe Checkout</th></tr></thead><tbody>${rows||"<tr><td colspan=4>Aún no hay ventas registradas.</td></tr>"}</tbody></table></div><div class="box mobile-sales"><strong>Detalle de ventas</strong>${cards||"<p>Aún no hay ventas registradas.</p>"}</div>`);
  }catch(e){console.error("Admin sales listing failed",e);return reply("<div class=box>No se pudo consultar el registro. Inténtalo de nuevo.</div>",503)}
}
export const config={path:"/admin/ventas",rateLimit:{action:"rate_limit",aggregateBy:"ip",windowSize:60,windowLimit:20}};
