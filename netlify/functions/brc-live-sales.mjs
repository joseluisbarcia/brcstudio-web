import { getStore } from '@netlify/blobs';
import { authorized, reply, paidSales } from '../../server/stripe-live.mjs';
export default async request => {
  if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405);
  if (!authorized(request)) return reply({ error: 'Unauthorized' }, 401);
  try {
    const store = getStore({ name: 'brc-live-events', consistency: 'strong' });
    const records = [];
    for await (const page of store.list({ prefix: 'events/', paginate: true })) {
      for (let i = 0; i < page.blobs.length; i += 20) {
        records.push(...(await Promise.all(page.blobs.slice(i, i + 20).map(b => store.get(b.key, { type: 'json' })))).filter(Boolean));
      }
      if (records.length > 10000) return reply({ error: 'Export required: journal too large for interactive view' }, 503);
    }
    return reply({ scope: 'live-account-audit', sales: paidSales(records), events: records,
      note: 'Gross receipts; review refunds/disputes separately. Account-wide journal, not a tax ledger. No automatic service provisioning.' });
  } catch { return reply({ error: 'Registry unavailable' }, 503); }
};
export const config = { path: '/api/brc-live-sales', rateLimit: { action: 'rate_limit', aggregateBy: 'ip', windowSize: 60, windowLimit: 10 } };
