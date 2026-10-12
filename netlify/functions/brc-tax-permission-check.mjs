import {createHash,timingSafeEqual} from 'node:crypto';
import {LIVE_ORDER_RELEASE_AUTHORIZED} from '../lib/order-checkout.mjs';
export default async function(req){
 const headers={'cache-control':'no-store, private','x-robots-tag':'noindex','referrer-policy':'no-referrer'};
 const digest=createHash('sha256').update(req.headers.get('authorization')??'').digest();
 if(Date.now()>1791936000000||!timingSafeEqual(digest,Buffer.from('e34ef55720bb4e671b4d43e65be0adfafedda63654782d6522b4e8c2900f3f95','hex')))return new Response('',{status:404,headers});
 if(req.method!=='GET')return new Response('',{status:405,headers});
 const key=Netlify.env.get('STRIPE_LIVE_SECRET_KEY');
 if(!/^(sk|rk)_live_/.test(key??''))return Response.json({error:'LIVE_KEY_UNAVAILABLE'},{status:503,headers});
 const r=await fetch('https://api.stripe.com/v1/tax_rates/txr_1UPX5ZDwLerTaplePClmgRMy',{headers:{Authorization:'Bearer '+key}});
 const t=await r.json();
 return Response.json({checked_at:new Date().toISOString(),source:'Netlify Functions Production; existing STRIPE_LIVE_SECRET_KEY',http_status:r.status,tax:r.ok?{id:t.id,active:t.active,livemode:t.livemode,country:t.country,percentage:t.percentage,inclusive:t.inclusive}:null,error_code:t.error?.code,environment_live_blocked:Netlify.env.get('BRC_LIVE_CHECKOUT_ENABLED')!=='true',code_live_blocked:LIVE_ORDER_RELEASE_AUTHORIZED===false},{headers});
}
