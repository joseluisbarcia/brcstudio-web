import {handleCancellation} from './brc-admin-cancellation.mjs';
export default req=>handleCancellation(req,'test');
export const config={path:'/admin/ventas/bajas-prueba',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:10}};
