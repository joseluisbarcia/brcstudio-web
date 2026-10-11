import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

// Test-only admin. Requires a long secret configured as BRC_ADMIN_PASSWORD in Netlify.
const headers = {"content-type":"text/html; charset=utf-8","cache-control":"no-store, private","x-robots-tag":"noindex, nofollow","x-content-type-options":"nosniff","referrer-policy":"no-referrer","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
const esc = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeEqual = (a,b) => {const x=createHash("sha256").update(a).digest(),y=createHash("sha256").update(b).digest();return timingSafeEqual(x,y)};
const mac = (value,password) => createHmac("sha256",password).update("brc-admin-v1:"+value).digest("hex");
const page = (body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BRC Studio · Ventas de prueba</title><style>body{font:16px system-ui,sans-serif;background:#f6f7fa;color:#18243e;margin:0;padding:28px 16px}.wrap{max-width:900px;margin:auto}h1{font-size:27px}p{line-height:1.6}.box{background:white;padding:24px;border-radius:14px;box-shadow:0 2px 18px #18243e12;margin:18px 0}input,button{font:inherit;padding:12px;border-radius:8px}input{width:100%;box-sizing:border-box;border:1px solid #aab2c2}button{border:0;background:#18243e;color:white;cursor:pointer;margin-top:12px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #ddd;word-break:break-word}small{color:#586274}.scroll{overflow-x:auto}a{color:#294ac2}</style></head><body><main class="wrap"><h1>BRC Studio · Ventas de prueba</h1><p>Panel privado · No se han realizado cobros reales.</p>${body}</main></body></html>`;
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
    const total=items.reduce((sum,s)=>sum+(Number(s.amount_total)||0),0);
    const rows=items.map(s=>`<tr><td>${esc(s.created_at?.slice(0,16).replace("T"," "))}</td><td>${esc(s.plan)}</td><td>${(Number(s.amount_total)/100).toLocaleString("es-ES",{style:"currency",currency:"EUR"})}</td><td><small>${esc(s.checkout_id)}</small></td></tr>`).join("");
    return reply(`<div class=box><strong>${items.length} ventas de prueba</strong><p>Importe simulado: ${(total/100).toLocaleString("es-ES",{style:"currency",currency:"EUR"})}. Máximo 500 registros visibles.</p><form method=post action='/admin/ventas'><input type=hidden name=action value=logout><button type=submit>Cerrar sesión</button></form></div><div class="box scroll"><table><thead><tr><th>Fecha UTC</th><th>Modalidad</th><th>Importe</th><th>Stripe Checkout</th></tr></thead><tbody>${rows||"<tr><td colspan=4>Aún no hay ventas registradas.</td></tr>"}</tbody></table></div>`);
  }catch(e){console.error("Admin sales listing failed",e);return reply("<div class=box>No se pudo consultar el registro. Inténtalo de nuevo.</div>",503)}
}
export const config={path:"/admin/ventas",rateLimit:{action:"rate_limit",aggregateBy:"ip",windowSize:60,windowLimit:20}};
