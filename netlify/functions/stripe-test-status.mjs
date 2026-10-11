// Read-only verification of a Stripe test Checkout Session.
// Never expose customer personal details or Stripe secrets to the browser.
export default async (request) => {
  if (request.method !== "GET") return new Response("Method not allowed", {status:405});
  const origin = new URL(request.url).origin;
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== origin) return new Response("Forbidden", {status:403});
  const id = new URL(request.url).searchParams.get("session_id") || "";
  if (!/^cs_test_[A-Za-z0-9]{15,}$/.test(id)) return Response.json({error:"Invalid test session"}, {status:400});
  const secret = Netlify.env.get("STRIPE_TEST_SECRET_KEY");
  if (!secret?.startsWith("sk_test_")) return Response.json({error:"Test mode unavailable"}, {status:503});
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions/"+encodeURIComponent(id), {
    headers:{Authorization:"Bearer "+secret}
  });
  if (!response.ok) return Response.json({error:"Session not found"}, {status:404});
  const session = await response.json();
  if (session.livemode !== false || session.metadata?.internal_test !== "true") return Response.json({error:"Not a BRC test session"}, {status:403});
  return Response.json({
    paid: session.payment_status === "paid" && session.status === "complete",
    status: session.status,
    plan: session.metadata?.brc_plan === "mensual" ? "mensual" : session.metadata?.brc_plan === "compra" ? "compra" : "desconocido",
    amount: session.amount_total,
    currency: session.currency,
    livemode: false
  }, {headers:{"Cache-Control":"no-store"}});
};
export const config = {path:"/api/stripe-test-status"};
