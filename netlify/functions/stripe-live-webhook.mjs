// Production receipt journal. Never charges, changes subscriptions or grants access.
import { createHmac, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

const monthlyPrice = "price_1UPVEWDwLerTapleCN8WYU7L";
const checkoutTypes = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];
const invoiceTypes = ["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"];
const subscriptionTypes = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"];
const id = (value, prefix) => typeof value === "string" && new RegExp("^" + prefix + "[A-Za-z0-9]+$").test(value);
const ref = value => typeof value === "string" ? value : value?.id ?? null;
const money = value => Number.isSafeInteger(value) && value >= 0;
const reply = (message, status=200) => new Response(message, {status, headers:{"Cache-Control":"no-store"}});

function verifySignature(body, header, secret) {
  const fields = (header || "").split(",").map(x=>x.trim());
  const timestamps = fields.filter(x=>x.startsWith("t="));
  if (timestamps.length !== 1 || !/^t=\d+$/.test(timestamps[0])) return false;
  const timestamp = Number(timestamps[0].slice(2));
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now()/1000-timestamp)>300) return false;
  const expected = createHmac("sha256",secret).update(String(timestamp)+"."+body).digest();
  return fields.filter(x=>x.startsWith("v1=")).some(x=>{
    const value=x.slice(3);
    return /^[0-9a-f]{64}$/i.test(value) && timingSafeEqual(expected,Buffer.from(value,"hex"));
  });
}

export default async function handler(request) {
  if (request.method!=="POST") return reply("Method not allowed",405);
  const secret=Netlify.env.get("STRIPE_LIVE_WEBHOOK_SECRET");
  if (!secret?.startsWith("whsec_")) return reply("Webhook not configured",503);
  const raw=await request.text();
  if (!verifySignature(raw,request.headers.get("stripe-signature"),secret)) return reply("Invalid signature",400);
  let event;
  try {event=JSON.parse(raw)} catch {return reply("Invalid payload",400)}
  if (!event || event.livemode!==true || !id(event.id,"evt_") ||
      !Number.isSafeInteger(event.created) || event.created<0 || event.created>8640000000000) return reply("Invalid live event",400);
  if (![...checkoutTypes,...invoiceTypes,...subscriptionTypes].includes(event.type)) return reply("Ignored");
  const obj=event.data?.object;
  if (!obj || obj.livemode!==true) return reply("Invalid live object",400);
  const common={stripe_event_id:event.id,event_type:event.type,created_at:new Date(event.created*1000).toISOString(),live:true};
  let key,record;
  if (checkoutTypes.includes(event.type)) {
    const plan=obj.metadata?.brc_plan;
    if (!id(obj.id,"cs_live_") || obj.payment_status!=="paid" || obj.status!=="complete" ||
        !["compra","mensual"].includes(plan) || obj.mode!==(plan==="compra"?"payment":"subscription")) return reply("Ignored");
    if (obj.currency!=="eur" || !money(obj.amount_total)) return reply("Invalid amount",400);
    key="checkout/"+obj.id;
    record={...common,checkout_id:obj.id,plan,mode:obj.mode,amount_total:obj.amount_total,currency:obj.currency,
      stripe_customer_id:ref(obj.customer),stripe_subscription_id:ref(obj.subscription),stripe_invoice_id:ref(obj.invoice)};
  } else if (subscriptionTypes.includes(event.type)) {
    if (!id(obj.id,"sub_") || !obj.items?.data?.some(item=>ref(item.price)===monthlyPrice)) return reply("Ignored");
    // Immutable snapshots: late events cannot overwrite a newer subscription state.
    key="subscription-events/"+obj.id+"/"+event.id;
    record={...common,stripe_subscription_id:obj.id,stripe_customer_id:ref(obj.customer),status:obj.status,
      cancel_at_period_end:obj.cancel_at_period_end===true,cancel_at:obj.cancel_at??null};
  } else {
    const subscription=ref(obj.parent?.subscription_details?.subscription ?? obj.subscription);
    if (!id(obj.id,"in_") || !id(subscription,"sub_")) return reply("Ignored");
    const belongs=obj.lines?.data?.some(line=>ref(line.pricing?.price_details?.price ?? line.price)===monthlyPrice);
    if (!belongs) return reply(obj.lines?.has_more ? "Incomplete invoice lines" : "Ignored",obj.lines?.has_more ? 503 : 200);
    if (obj.currency!=="eur" || !money(obj.amount_due) || !money(obj.amount_paid)) return reply("Invalid amount",400);
    if (event.type==="invoice.paid" && obj.status!=="paid") return reply("Ignored");
    const renewal=event.type==="invoice.paid" && obj.billing_reason==="subscription_cycle";
    // Initial invoices are a journal entry, NOT another sale alongside Checkout.
    key=renewal ? "renewal/"+obj.id : "invoice-events/"+obj.id+"/"+event.id;
    record={...common,stripe_invoice_id:obj.id,stripe_subscription_id:subscription,stripe_customer_id:ref(obj.customer),
      billing_reason:obj.billing_reason,status:obj.status,amount_total:obj.amount_paid,amount_due:obj.amount_due,
      currency:obj.currency,renewal};
  }
  try {
    const store=getStore({name:"brc-live-sales",consistency:"strong"});
    // One atomic write: no race-prone read-then-write; await persistence before 2xx.
    const result=await store.setJSON(key,record,{onlyIfNew:true});
    return reply(result.modified ? "Registered" : "Already registered");
  } catch {
    // Stripe retries failed deliveries. Never acknowledge a lost record as success.
    return reply("Storage unavailable",503);
  }
}
export const config={path:"/api/stripe-live-webhook"};
