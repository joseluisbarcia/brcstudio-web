// BRC Studio — production Stripe webhook. Records verified paid checkout sessions.
// This endpoint never initiates charges or activates public checkout.
import { createHmac, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

function verifySignature(body, header, secret) {
  const fields = (header || "").split(",");
  const timestamp = Number(fields.find(x => x.startsWith("t="))?.slice(2));
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret).update(String(timestamp) + "." + body).digest();
  return fields.filter(x => x.startsWith("v1=")).some(x => {
    const value = x.slice(3);
    return /^[0-9a-f]{64}$/i.test(value) && timingSafeEqual(expected, Buffer.from(value, "hex"));
  });
}

export default async function handler(request) {
  if (request.method !== "POST") return new Response("Method not allowed", {status:405});
  const secret = Netlify.env.get("STRIPE_LIVE_WEBHOOK_SECRET");
  if (!secret?.startsWith("whsec_")) return new Response("Webhook not configured", {status:503});
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("stripe-signature"), secret)) return new Response("Invalid signature", {status:400});
  let event;
  try { event = JSON.parse(raw); } catch { return new Response("Invalid payload", {status:400}); }
  if (event.livemode !== true || !event.id?.startsWith("evt_")) return new Response("Live events only", {status:400});
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) return new Response("Ignored", {status:200});
  const session = event.data?.object;
  if (!session?.id?.startsWith("cs_live_") || session.payment_status !== "paid") return new Response("Ignored", {status:200});
  if (!["payment","subscription"].includes(session.mode)) return new Response("Ignored", {status:200});
  const store = getStore("brc-live-sales");
  const key = "checkout/" + session.id;
  if (await store.get(key, {type:"json"})) return new Response("Already registered", {status:200});
  await store.setJSON(key, {
    checkout_id:session.id,
    mode:session.mode,
    amount_total:session.amount_total,
    currency:session.currency,
    stripe_customer_id:typeof session.customer === "string" ? session.customer : null,
    stripe_subscription_id:typeof session.subscription === "string" ? session.subscription : null,
    stripe_invoice_id:typeof session.invoice === "string" ? session.invoice : null,
    stripe_event_id:event.id,
    created_at:new Date(event.created * 1000).toISOString(),
    live:true
  }, {onlyIfNew:true});
  return new Response("Registered", {status:200});
}
export const config = {path:"/api/stripe-live-webhook"};
