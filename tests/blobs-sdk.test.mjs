import test from 'node:test';
import assert from 'node:assert/strict';
import {getStore} from '@netlify/blobs';
test('installed Blobs SDK sends atomic create condition and reports conflicts',async()=>{
 let exists=false,stored;
 const db=getStore({name:'sdk-fixture',siteID:'fixture',token:'fixture',fetch:async(url,options)=>{
  if(url.startsWith('https://api.netlify.com/'))return Response.json({url:'https://fixture.invalid/object'});
  assert.equal(options.headers['if-none-match'],'*');
  if(exists)return new Response(null,{status:412});
  exists=true;stored=options.body;return new Response(null,{status:200,headers:{etag:'fixture-etag'}});
 }});
 assert.equal((await db.setJSON('immutable',{value:1},{onlyIfNew:true})).modified,true);
 assert.equal((await db.setJSON('immutable',{value:2},{onlyIfNew:true})).modified,false);
 assert.deepEqual(JSON.parse(stored),{value:1});
});
