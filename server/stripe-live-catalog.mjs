// Live IDs must be verified against the connected LIVE account before filling these fields.
// The expected amounts below were read from the existing sandbox on 2026-10-11.
export const commercialReleaseApproved = false;
export const catalog = {
  web_fase1: { amount: 49000, priceId: null, productId: null },
  web_fase2: { amount: 29000, priceId: null, productId: null },
  web_fase3: { amount: 24900, priceId: null, productId: null },
  alta: { amount: 14900, priceId: null, productId: null },
  mensual: { amount: 3900, interval: 'month', priceId: null, productId: null },
  compra_1_6: { amount: 29000, priceId: null, productId: null },
  compra_7_12: { amount: 19000, priceId: null, productId: null },
  compra_13: { amount: 9900, priceId: null, productId: null }
};
export const plans = {
  compra: ['web_fase1'], compra_fase2: ['web_fase2'], compra_fase3: ['web_fase3'],
  mensual: ['alta', 'mensual'], compra_1_6: ['compra_1_6'],
  compra_7_12: ['compra_7_12'], compra_13: ['compra_13']
};
