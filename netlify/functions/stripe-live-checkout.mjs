import { getStore } from '@netlify/blobs';
import { commercialReleaseApproved } from '../../server/stripe-live-catalog.mjs';
import { env, reply, authorized, origin, client, checkoutParams } from '../../server/stripe-live.mjs';
export default async request => {
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  // Hard release gate + production-only environment gate. No call reaches Stripe while closed.
  if (!commercialReleaseApproved || env('BRC_LIVE_CHECKOUT_ENABLED') !== 'true' || env('CONTEXT') !== 'production') return reply({ error: 'Real payments disabled' }, 503);
  if (new URL(request.url).origin !== origin || (request.headers.get('origin') && request.headers.get('origin') !== origin)) return reply({ error: 'Forbidden' }, 403);
  if (!authorized(request)) return reply({ error: 'Unauthorized' }, 401);
  let input;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return reply({ error: 'Request too large' }, 413);
    input = JSON.parse(raw);
  } catch { return reply({ error: 'Invalid JSON' }, 400); }
  try {
    const stripe = client();
    const params = await checkoutParams(stripe, input);
    const session = await stripe.checkout.sessions.create(params, { idempotencyKey: 'brc-live:' + input.orderId });
    if (!session.livemode || !session.id?.startsWith('cs_live_') || !session.url?.startsWith('https://checkout.stripe.com/')) throw new Error('Unexpected session');
    await getStore({ name: 'brc-live-checkouts', consistency: 'strong' }).setJSON(session.id, {
      checkout_id: session.id, order_id: input.orderId, customer_id: input.customerId,
      plan: input.plan, contract_ref: input.contractRef, created: session.created
    });
    return reply({ id: session.id, url: session.url, livemode: true });
  } catch {
    return reply({ error: 'Checkout unavailable; check catalog, tax review and configuration' }, 503);
  }
};
export const config = { path: '/api/stripe-live-checkout', rateLimit: { action: 'rate_limit', aggregateBy: 'ip', windowSize: 60, windowLimit: 10 } };
