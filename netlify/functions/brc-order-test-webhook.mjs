import {handleWebhook} from './stripe-live-webhook.mjs';
export default req=>handleWebhook(req,false);
export const config={path:'/api/brc-order-test-webhook'};
