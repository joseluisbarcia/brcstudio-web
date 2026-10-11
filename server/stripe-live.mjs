import Stripe from 'stripe';
import { createHash, timingSafeEqual } from 'node:crypto';
import { catalog, plans } from './stripe-live-catalog.mjs';
export const API_VERSION = '2026-08-26.dahlia';
export const origin = 'https://brcstudio.es';
export const env = key => globalThis.Netlify?.env.get(key);
export const reply = (data, status = 200) => Response.json(data, { status, headers: {
  'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer'
}});
export function authorized(req) {
  const token = env('BRC_LIVE_ADMIN_TOKEN');
  const candidate = req.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  return !!token && token.length >= 32 && candidate.length <= 1024 && timingSafeEqual(
    createHash('sha256').update(token).digest(), createHash('sha256').update(candidate).digest());
}
export function client() {
  const key = env('STRIPE_LIVE_SECRET_KEY');
  if (!/^(rk|sk)_live_/.test(key || '')) throw new Error('Live key unavailable');
  return new Stripe(key, { apiVersion: API_VERSION, maxNetworkRetries: 2, timeout: 15000 });
}
export function configuredItem(key) {
  const entry = catalog[key];
  if (!entry) throw new Error('Unknown catalog item');
  let ids;
  try { ids = JSON.parse(env('BRC_LIVE_CATALOG_JSON') || '{}')[key]; } catch { throw new Error('Invalid catalog configuration'); }
  if (!/^price_[A-Za-z0-9]+$/.test(ids?.priceId || '') || !/^prod_[A-Za-z0-9]+$/.test(ids?.productId || '')) throw new Error('Live catalog unavailable');
  return { ...entry, priceId: ids.priceId, productId: ids.productId };
}
export function validatePrice(price, expected) {
  if (!price || price.livemode !== true || !price.active || price.currency !== 'eur' ||
      price.unit_amount !== expected.amount || price.tax_behavior !== 'exclusive' ||
      price.billing_scheme !== 'per_unit' || price.transform_quantity ||
      price.id !== expected.priceId || (price.product?.id || price.product) !== expected.productId ||
      (expected.interval ? price.type !== 'recurring' || price.recurring?.interval !== 'month' ||
        price.recurring.interval_count !== 1 || price.recurring.usage_type !== 'licensed' : price.type !== 'one_time')) {
    throw new Error('Catalog mismatch');
  }
  if (typeof price.product !== 'object' || price.product.deleted || !price.product.active || !price.product.livemode) throw new Error('Inactive product');
}
export function validateCustomer(customer) {
  const a = customer.address;
  // This initial assisted-sales integration ONLY supports the reviewed domestic 21% case.
  // Reject Canary Islands, Ceuta and Melilla; never infer VAT solely from a country code.
  if (customer.deleted || customer.livemode !== true || customer.tax_exempt !== 'none' ||
      a?.country !== 'ES' || !a.line1 || !a.city || !/^(0[1-9]|[1-4][0-9]|5[0-2])\d{3}$/.test(a.postal_code || '') ||
      /^(35|38|51|52)/.test(a.postal_code) || !customer.name || !customer.email) throw new Error('Customer requires fiscal review');
}
export function validateTax(tax) {
  if (!tax.active || !tax.livemode || tax.inclusive || tax.percentage !== 21 || tax.country !== 'ES') throw new Error('Tax mismatch');
}
export async function checkoutParams(stripe, input, now = Date.now()) {
  if (!input || !Object.hasOwn(plans, input.plan) || input.fiscalReview !== 'ES_GENERAL_21' ||
      typeof input.contractRef !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(input.contractRef) ||
      !/^cus_[A-Za-z0-9]+$/.test(input.customerId || '') ||
      !/^\d{13}-[0-9a-f-]{36}$/.test(input.orderId || '')) throw new Error('Invalid order');
  const issued = Number(input.orderId.slice(0, 13));
  // Stripe idempotency keys can expire after 24h. An order is only usable for 20h.
  if (issued > now + 60000 || now - issued > 20 * 3600000) throw new Error('Order expired');
  const customer = await stripe.customers.retrieve(input.customerId);
  validateCustomer(customer);
  const taxId = env('STRIPE_LIVE_TAX_RATE');
  if (!/^txr_[A-Za-z0-9]+$/.test(taxId || '')) throw new Error('Tax unavailable');
  validateTax(await stripe.taxRates.retrieve(taxId));
  const line_items = [];
  for (const key of plans[input.plan]) {
    const item = configuredItem(key);
    if (!item.priceId || !item.productId) throw new Error('Catalog not verified');
    validatePrice(await stripe.prices.retrieve(item.priceId, { expand: ['product'] }), item);
    line_items.push({ price: item.priceId, quantity: 1, tax_rates: [taxId] });
  }
  const metadata = { brc_integration: 'brc-live-v1', brc_order: input.orderId, brc_plan: input.plan, contract_ref: input.contractRef };
  const params = {
    mode: input.plan === 'mensual' ? 'subscription' : 'payment', customer: input.customerId,
    client_reference_id: input.orderId, metadata, line_items,
    success_url: origin + '/api/stripe-live-return', cancel_url: origin + '/',
    billing_address_collection: 'required', locale: 'es',
    tax_id_collection: { enabled: true },
    // Keep the reviewed Customer address unchanged; tax is a manual reviewed rate.
    integration_identifier: 'brc-assisted-live-jkqvnmsp',
    expires_at: Math.floor(issued / 1000) + 23 * 3600
  };
  if (params.mode === 'subscription') params.subscription_data = { metadata, default_tax_rates: [taxId] };
  else params.payment_intent_data = { metadata };
  // Do not opt into paid automatic tax or post-payment invoicing features.
  return params;
}
export const eventTypes = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
  'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required',
  'invoice.finalization_failed', 'customer.subscription.created',
  'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.paused', 'customer.subscription.resumed',
  'charge.refunded', 'refund.created', 'refund.updated', 'refund.failed',
  'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed'
]);
const id = x => typeof x === 'string' ? x : x?.id || null;
export function eventRecord(event) {
  const o = event.data?.object;
  if (!/^evt_[A-Za-z0-9]+$/.test(event.id || '') || event.livemode !== true ||
      !o?.id || o.livemode !== true || event.account || !Number.isSafeInteger(event.created)) throw new Error('Invalid live event');
  if (!eventTypes.has(event.type)) return null;
  const isCheckout = event.type.startsWith('checkout.');
  const isInvoice = event.type.startsWith('invoice.');
  const isSubscription = event.type.startsWith('customer.subscription.');
  // Account-wide immutable audit journal: retain relationship IDs, never card/address/email data.
  // A repeated event overwrites the exact same deterministic record; no counters or side effects.
  return {
    event_id: event.id, event_type: event.type, created: event.created, live: true,
    object_id: o.id, customer_id: id(o.customer),
    checkout_id: isCheckout ? o.id : null,
    subscription_id: isSubscription ? o.id : id(o.subscription || o.parent?.subscription_details?.subscription),
    invoice_id: isInvoice ? o.id : id(o.invoice), payment_intent_id: id(o.payment_intent),
    charge_id: o.object === 'charge' ? o.id : id(o.charge),
    mode: o.mode || null, status: o.status || null, payment_status: o.payment_status || null,
    currency: o.currency || null, amount_total: isCheckout ? o.amount_total : null,
    amount_paid: isInvoice ? o.amount_paid : null,
    amount_refunded: o.object === 'charge' ? o.amount_refunded : null,
    refund_amount: o.object === 'refund' ? o.amount : null,
    cancel_at_period_end: isSubscription ? o.cancel_at_period_end : null,
    brc_order: o.metadata?.brc_integration === 'brc-live-v1' ? o.metadata.brc_order || null : null
  };
}
export function paidSales(records) {
  // Count subscription receipts only from invoice.paid, never their initial Checkout too.
  // Deduplicate distinct events describing the same Checkout/invoice.
  const sales = new Map();
  for (const r of [...records].sort((a,b) => a.created-b.created || a.event_id.localeCompare(b.event_id))) {
    if (r.event_type === 'invoice.paid' && r.subscription_id && r.amount_paid > 0) {
      sales.set(r.invoice_id, { source: r.invoice_id, customer_id: r.customer_id, subscription_id: r.subscription_id, amount: r.amount_paid, currency: r.currency });
    } else if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(r.event_type) && r.mode === 'payment' && r.payment_status === 'paid') {
      sales.set(r.checkout_id, { source: r.checkout_id, customer_id: r.customer_id, amount: r.amount_total, currency: r.currency });
    }
  }
  return [...sales.values()];
}
