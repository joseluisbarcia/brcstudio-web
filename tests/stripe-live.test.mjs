import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { catalog, commercialReleaseApproved } from '../server/stripe-live-catalog.mjs';
import { eventRecord, paidSales, checkoutParams, validatePrice, validateCustomer, validateTax } from '../server/stripe-live.mjs';
import checkout from '../netlify/functions/stripe-live-checkout.mjs';
import { createHandler } from '../netlify/functions/stripe-live-webhook.mjs';
import sales from '../netlify/functions/brc-live-sales.mjs';
const values = {};
globalThis.Netlify = { env: { get: key => values[key] } };
const event = (type, obj = {}, eid = 'evt_fixture') => ({ id: eid, type, livemode: true, created: 1791750000, data: { object: { id: 'cs_live_fixture', object: 'checkout.session', livemode: true, mode: 'payment', payment_status: 'paid', amount_total: 59290, currency: 'eur', ...obj } } });
const customer = { id: 'cus_fixture', livemode: true, name: 'Fixture', email: 'fixture@example.invalid', tax_exempt: 'none', address: { country: 'ES', postal_code: '28001', line1: 'Fixture', city: 'Madrid' } };
const tax = { active: true, livemode: true, inclusive: false, percentage: 21, country: 'ES' };
const price = expected => ({ id: expected.priceId, livemode: true, active: true, currency: 'eur', unit_amount: expected.amount, tax_behavior: 'exclusive', billing_scheme: 'per_unit', product: { id: expected.productId, active: true, livemode: true }, type: expected.interval ? 'recurring' : 'one_time', recurring: expected.interval ? { interval: 'month', interval_count: 1, usage_type: 'licensed' } : null });
test('hard release gate prevents Stripe calls even if runtime enabled', async () => {
  assert.equal(commercialReleaseApproved, false);
  values.BRC_LIVE_CHECKOUT_ENABLED = 'true'; values.CONTEXT = 'production';
  const response = await checkout(new Request('https://brcstudio.es/api/stripe-live-checkout', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Real payments disabled' });
});
test('private sales endpoint rejects missing credentials', async () => {
  assert.equal((await sales(new Request('https://brcstudio.es/api/brc-live-sales'))).status, 401);
});
test('price validation rejects test, wrong amount, tax and recurring interval', () => {
  const expected = { amount: 3900, interval: 'month', priceId: 'price_fixture', productId: 'prod_fixture' };
  const p = price(expected); validatePrice(p, expected);
  for (const patch of [{ livemode: false }, { unit_amount: 390 }, { tax_behavior: 'inclusive' }, { recurring: { interval: 'year' } }, { active: false }]) assert.throws(() => validatePrice({ ...p, ...patch }, expected));
});
test('VAT validation excludes unreviewed tax and territories', () => {
  validateTax(tax); validateCustomer(customer);
  assert.throws(() => validateTax({ ...tax, inclusive: true }));
  assert.throws(() => validateTax({ ...tax, livemode: false }));
  for (const postal_code of ['35001','38001','51001','52001','00000']) assert.throws(() => validateCustomer({ ...customer, address: { ...customer.address, postal_code } }));
  assert.throws(() => validateCustomer({ ...customer, tax_exempt: 'exempt' }));
});
test('monthly checkout includes one-time setup and renewal tax without paid add-ons', async () => {
  const backup = structuredClone(catalog);
  try {
    for (const [key,item] of Object.entries(catalog)) { item.priceId = 'price_' + key; item.productId = 'prod_' + key; }
    values.STRIPE_LIVE_TAX_RATE = 'txr_fixture';
    const stripe = { customers: { retrieve: async () => customer }, taxRates: { retrieve: async () => tax }, prices: { retrieve: async id => price(Object.values(catalog).find(v => v.priceId === id)) } };
    const now = Date.now();
    const input = { plan: 'mensual', fiscalReview: 'ES_GENERAL_21', contractRef: 'contract_fixture', customerId: 'cus_fixture', orderId: `${now}-12345678-1234-1234-1234-123456789012` };
    const params = await checkoutParams(stripe, input, now);
    assert.equal(params.mode, 'subscription'); assert.equal(params.line_items.length, 2);
    assert.deepEqual(params.line_items.map(x => x.price), ['price_alta', 'price_mensual']);
    assert.deepEqual(params.subscription_data.default_tax_rates, ['txr_fixture']);
    assert.equal(params.automatic_tax, undefined); assert.equal(params.invoice_creation, undefined);
    assert.equal(params.payment_method_types, undefined);
    await assert.rejects(checkoutParams(stripe, { ...input, plan: '__proto__' }, now));
    await assert.rejects(checkoutParams(stripe, input, now + 21 * 3600000));
  } finally { for (const key of Object.keys(catalog)) Object.assign(catalog[key], backup[key]); }
});
test('out-of-order duplicate checkout and invoice events count receipts once', () => {
  const records = [eventRecord(event('checkout.session.completed')), eventRecord(event('checkout.session.async_payment_succeeded', {}, 'evt_duplicate')),
    eventRecord(event('checkout.session.completed', { id: 'cs_live_monthly', mode: 'subscription', subscription: 'sub_fixture', amount_total: 22748 }, 'evt_monthly')),
    eventRecord(event('invoice.paid', { id: 'in_fixture', object: 'invoice', parent: { subscription_details: { subscription: 'sub_fixture' } }, amount_paid: 22748 }, 'evt_invoice')),
    eventRecord(event('invoice.payment_failed', { id: 'in_fixture', object: 'invoice', amount_paid: 0 }, 'evt_failed'))];
  assert.equal(paidSales([...records, ...records].reverse()).length, 2);
  assert.equal(paidSales(records).reduce((sum,s) => sum+s.amount, 0), 82038);
  assert.equal(paidSales([eventRecord(event('checkout.session.completed', { payment_status: 'unpaid' }))]).length, 0);
});
test('journal excludes PII and retains lifecycle/refund relationship IDs', () => {
  const e = event('charge.refunded', { id: 'ch_fixture', object: 'charge', payment_intent: 'pi_fixture', amount_refunded: 100, billing_details: { email: 'secret@example.invalid' } });
  const r = eventRecord(e); assert.equal(r.charge_id, 'ch_fixture'); assert.equal(r.payment_intent_id, 'pi_fixture'); assert.equal(r.amount_refunded, 100);
  assert.equal(JSON.stringify(r).includes('secret@example.invalid'), false);
  assert.throws(() => eventRecord({ ...e, livemode: false }));
  assert.throws(() => eventRecord({ ...e, account: 'acct_other' }));
});
test('signed webhook persists idempotently; bad signatures, test events and storage failure are rejected', async () => {
  values.CONTEXT = 'production'; values.STRIPE_LIVE_WEBHOOK_SECRET = 'whsec_local_fixture_only';
  const records = new Map();
  const handler = createHandler(() => ({ setJSON: async (key, data) => records.set(key,data) }));
  const request = (e, timestamp) => {
    const payload = JSON.stringify(e);
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: values.STRIPE_LIVE_WEBHOOK_SECRET, ...(timestamp ? { timestamp } : {}) });
    return new Request('https://brcstudio.es/api/stripe-live-webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } });
  };
  assert.equal((await handler(request(event('checkout.session.completed')))).status, 200);
  assert.equal((await handler(request(event('checkout.session.completed')))).status, 200); assert.equal(records.size, 1);
  assert.equal((await handler(request({ ...event('checkout.session.completed'), livemode: false }))).status, 400);
  assert.equal((await handler(request(event('checkout.session.completed'), 100))).status, 400);
  assert.equal((await handler(new Request('https://brcstudio.es/api/stripe-live-webhook', { method: 'POST', body: '{}' }))).status, 400);
  const failed = createHandler(() => ({ setJSON: async () => { throw new Error('offline'); } }));
  assert.equal((await failed(request(event('invoice.payment_failed')))).status, 503);
  values.CONTEXT = 'deploy-preview'; assert.equal((await handler(request(event('checkout.session.completed')))).status, 503);
});
