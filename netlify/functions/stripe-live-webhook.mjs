import Stripe from 'stripe';
import { getStore } from '@netlify/blobs';
import { env, reply, eventRecord } from '../../server/stripe-live.mjs';
export const createHandler = (storeFactory = getStore) => async request => {
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const secret = env('STRIPE_LIVE_WEBHOOK_SECRET');
  if (env('CONTEXT') !== 'production' || !secret?.startsWith('whsec_')) return reply({ error: 'Webhook unavailable' }, 503);
  const raw = await request.text();
  if (raw.length > 1048576) return reply({ error: 'Payload too large' }, 413);
  let record;
  try {
    const event = Stripe.webhooks.constructEvent(raw, request.headers.get('stripe-signature'), secret, 300);
    record = eventRecord(event);
  } catch { return reply({ error: 'Invalid event or signature' }, 400); }
  if (!record) return reply({ received: true, ignored: true });
  try {
    await storeFactory({ name: 'brc-live-events', consistency: 'strong' }).setJSON('events/' + record.event_id, record);
    return reply({ received: true });
  } catch {
    // Never acknowledge a lost event; Stripe retries non-2xx deliveries.
    return reply({ error: 'Persistence unavailable' }, 503);
  }
};
export default createHandler();
export const config = { path: '/api/stripe-live-webhook' };
