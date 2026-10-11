// Read-only audit. No sessions, payments, products, registrations or webhooks are created.
// Run in a secure shell with a restricted live key injected; never paste it into this file.
import Stripe from 'stripe';
import { catalog } from '../server/stripe-live-catalog.mjs';
import { API_VERSION } from '../server/stripe-live.mjs';
const key = process.env.STRIPE_LIVE_SECRET_KEY;
if (!/^(rk|sk)_live_/.test(key || '')) { console.error('Restricted live key required in environment.'); process.exit(1); }
const stripe = new Stripe(key, { apiVersion: API_VERSION, maxNetworkRetries: 2 });
try {
  const account = await stripe.accounts.retrieve();
  const products = await stripe.products.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 1000 });
  const prices = await stripe.prices.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 1000 });
  const taxes = await stripe.taxRates.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 1000 });
  const items = Object.entries(catalog).map(([key, expected]) => {
    const candidates = products.filter(p => p.livemode && p.metadata?.brc_key === key);
    const product = candidates.length === 1 ? candidates[0] : null;
    const matches = prices.filter(p => p.livemode && p.product === product?.id &&
      p.unit_amount === expected.amount && p.currency === 'eur' && p.tax_behavior === 'exclusive' &&
      p.billing_scheme === 'per_unit' && !p.transform_quantity &&
      (expected.interval ? p.type === 'recurring' && p.recurring?.interval === 'month' && p.recurring.interval_count === 1 && p.recurring.usage_type === 'licensed' : p.type === 'one_time'));
    return { key, expected_eur: expected.amount / 100, product_id: product?.id || null, name: product?.name || null,
      price_id: matches.length === 1 ? matches[0].id : null, verified: !!product && matches.length === 1,
      interval: expected.interval || null, matching_products: candidates.length, matching_prices: matches.length };
  });
  const report = { checked_at: new Date().toISOString(), account_id: account.id,
    charges_enabled: account.charges_enabled, payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted, items,
    tax_rates: taxes.filter(t => t.livemode).map(t => ({ id: t.id, percentage: t.percentage, country: t.country, inclusive: t.inclusive, active: t.active })),
    note: 'Amounts are expected sandbox references, not independently approved live pricing. Automatic Tax not enabled. No legal or fiscal validation implied.' };
  console.log(JSON.stringify(report, null, 2));
  if (items.some(i => !i.verified)) process.exitCode = 2;
} catch { console.error('Audit failed. Check live account permissions privately; no secrets or raw Stripe errors were printed.'); process.exitCode = 1; }
