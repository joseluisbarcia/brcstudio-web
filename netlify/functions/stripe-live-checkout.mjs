// BRC Studio — live Checkout, intentionally disabled until explicitly authorized.
// No public checkout is enabled by deploying this function.
const catalog = {
  compra: {mode:"payment", prices:["price_1UPVC0DwLerTapleRTy7YYO6"]},
  mensual: {mode:"subscription", prices:["price_1UPVE7DwLerTaplejCffcCrc","price_1UPVEWDwLerTapleCN8WYU7L"]}
};
const json = (body,status=200) => Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export default async function handler(request) {
  if (request.method !== "POST") return new Response("Method not allowed",{status:405});
  // Must be explicitly enabled after final verification and owner's authorization.
  if (Netlify.env.get("BRC_LIVE_CHECKOUT_ENABLED") !== "true") return json({error:"Live checkout is disabled"},503);
  const secret = Netlify.env.get("STRIPE_LIVE_SECRET_KEY");
  const tax = Netlify.env.get("STRIPE_LIVE_TAX_RATE");
  if (!secret?.startsWith("rk_live_") && !secret?.startsWith("sk_live_")) return json({error:"Checkout not configured"},503);
  if (!tax?.startsWith("txr_")) return json({error:"Live tax rate not configured"},503);
  const origin = new URL(request.url).origin;
  if (origin !== "https://brcstudio.es") return json({error:"Forbidden host"},403);
  if (request.headers.get("origin") !== origin) return json({error:"Forbidden origin"},403);
  let data;
  try { data = await request.json(); } catch { return json({error:"Invalid JSON"},400); }
  if (!data || !Object.hasOwn(catalog,data.plan)) return json({error:"Unknown plan"},400);
  const plan = catalog[data.plan];
  const body = new URLSearchParams({
    mode:plan.mode,
    success_url:origin+"/?pago=correcto&session_id={CHECKOUT_SESSION_ID}",
    cancel_url:origin+"/?pago=cancelado",
    billing_address_collection:"required",
    "tax_id_collection[enabled]":"true",
    "metadata[brc_plan]":data.plan
  });
  plan.prices.forEach((price,i)=>{
    body.set(`line_items[${i}][price]`,price);
    body.set(`line_items[${i}][quantity]`,"1");
    body.set(`line_items[${i}][tax_rates][0]`,tax);
  });
  if (data.plan==="compra") body.set("invoice_creation[enabled]","true");
  let response;
  try {
    response=await fetch("https://api.stripe.com/v1/checkout/sessions",{
      method:"POST",headers:{Authorization:"Bearer "+secret,"Content-Type":"application/x-www-form-urlencoded"},body
    });
  } catch {return json({error:"Payment provider unavailable"},502);}
  if (!response.ok) return json({error:"Checkout creation failed"},502);
  const session=await response.json();
  if (session.livemode!==true || !session.url?.startsWith("https://checkout.stripe.com/")) return json({error:"Invalid checkout response"},502);
  return json({url:session.url,id:session.id});
}
export const config={path:"/api/stripe-live-checkout",rateLimit:{action:"rate_limit",aggregateBy:"ip",windowSize:60,windowLimit:10}};
