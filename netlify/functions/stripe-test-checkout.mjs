// BRC Studio — test-only Stripe Checkout session creator.
const plans = {
  mensual: ["STRIPE_TEST_PRICE_MONTHLY", "STRIPE_TEST_PRICE_SETUP"],
  compra: ["STRIPE_TEST_PRICE_PURCHASE"]
};
export default async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const origin = new URL(request.url).origin;
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== origin) return new Response("Forbidden", { status: 403 });
  const secret = Netlify.env.get("STRIPE_TEST_SECRET_KEY");
  const tax = Netlify.env.get("STRIPE_TEST_TAX_RATE");
  if (!secret?.startsWith("sk_test_") || !tax?.startsWith("txr_")) return Response.json({ error: "Test checkout not configured" }, { status: 503 });
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const plan = payload?.plan;
  if (!Object.hasOwn(plans, plan)) return Response.json({ error: "Unknown plan" }, { status: 400 });
  const ids = plans[plan].map((key) => Netlify.env.get(key));
  if (ids.some((id) => !id?.startsWith("price_"))) return Response.json({ error: "Prices not configured" }, { status: 503 });
  const body = new URLSearchParams({
    mode: plan === "mensual" ? "subscription" : "payment",
    success_url: origin + "/stripe-test-success.html?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: origin + "/stripe-test-cancel.html",
    billing_address_collection: "required",
    "tax_id_collection[enabled]": "true",
    "metadata[brc_plan]": plan,
    "metadata[internal_test]": "true"
  });
  ids.forEach((price, i) => {
    body.set(`line_items[${i}][price]`, price);
    body.set(`line_items[${i}][quantity]`, "1");
    body.set(`line_items[${i}][tax_rates][0]`, tax);
  });
  if (plan === "compra") body.set("invoice_creation[enabled]", "true");
  const result = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await result.json();
  if (!result.ok) return Response.json({ error: "Stripe checkout unavailable" }, { status: 502 });
  return Response.json({ url: data.url, id: data.id, livemode: data.livemode });
};
export const config = { path: "/api/stripe-test-checkout" };
