// BRC Studio test webhook: verified Stripe events -> Netlify Blobs.
// Production payments are deliberately rejected. No card or address data is stored.
import { createHmac, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

function verify(body, header, secret) {
  const parts = Object.fromEntries((header || "").split(",").map(x => x.split("=")).filter(x => x.length === 2));
  const timestamp = Number(parts.t);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now()/1000 - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret).update(String(timestamp) + "." + body).digest("hex");
  const candidates = (header || "").split(",").filter(x=>x.startsWith("v1=")).map(x=>x.slice(3));
  return candidates.some(value => /^[0-9a-f]{64}$/.test(value) && timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(value,"hex")));
}
export default async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", {status:405});
  const secret = Netlify.env.get("STRIPE_TEST_WEBHOOK_SECRET");
  if (!secret?.startsWith("whsec_")) return new Response("Webhook not configured", {status:503});
  const raw = await request.text();
  if (!verify(raw, request.headers.get("stripe-signature"), secret)) return new Response("Invalid signature", {status:400});
  let event;
  try {event=JSON.parse(raw)} catch {return new Response("Invalid payload",{status:400})}
  if (event.livemode !== false || !event.id?.startsWith("evt_")) return new Response("Test events only",{status:400});
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return new Response("Ignored",{status:200});
  const s = event.data?.object;
  if (!s?.id?.startsWith("cs_test_") || s.payment_status !== "paid" || s.metadata?.internal_test !== "true" || !["mensual","compra"].includes(s.metadata?.brc_plan)) return new Response("Ignored",{status:200});
  const store = getStore("brc-test-sales");
  const key = "checkout/" + s.id;
  const existing = await store.get(key,{type:"json"});
  if (existing) return new Response("Already registered",{status:200});
  await store.setJSON(key,{
    checkout_id:s.id, plan:s.metadata.brc_plan, amount_total:s.amount_total,
    currency:s.currency, stripe_customer_id:typeof s.customer==="string"?s.customer:null,
    stripe_invoice_id:typeof s.invoice==="string"?s.invoice:null,
    stripe_event_id:event.id, created_at:new Date(event.created*1000).toISOString(), test:true
  },{onlyIfNew:true});
  return new Response("Registered",{status:200});
};
export const config = {path:"/api/stripe-test-webhook"};
