import {originOK,store,customer,page} from '../lib/orders.mjs';
import {checkoutForOrder} from '../lib/order-checkout.mjs';
export default async function(req){
 if(req.method!=='POST')return page('Método no permitido',405);
 if(!originOK(req))return page('Origen no permitido',403);
 try{
  const form=await req.formData(),db=store(),identity=await customer(String(form.get('token')??''),db);
  if(!identity)return page('Verificación del cliente requerida',401);
  const result=await checkoutForOrder(identity,db,k=>Netlify.env.get(k));
  return result.url?new Response(null,{status:303,headers:{location:result.url,'cache-control':'no-store','referrer-policy':'no-referrer'}}):page('No se ha abierto Checkout: '+result.error,result.status);
 }catch{return page('No se pudo confirmar Checkout. Reintentar conserva la misma tentativa.',503)}
}
export const config={path:'/api/brc-order-checkout',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:10}};
