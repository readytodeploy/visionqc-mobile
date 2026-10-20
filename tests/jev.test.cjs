const {test}=require('node:test');const assert=require('node:assert/strict');
const handler=require('../api/jev.js');const {normalize}=require('../api/lib/jev-policy');
const fixture=()=>({model:'jev-1.14.0',answers:{decision:{type:'choice',choice:'defect',confidence:.95},defect_type:{type:'choice',choice:'seam',confidence:.9},defect_box:{type:'box',box:{left:.1,top:.2,right:.7,bottom:.8},confidence:.9}}});
function jpeg(width=448,height=448){const b=Buffer.from([255,216,255,192,0,8,8,0,0,0,0,1,255,217]);b.writeUInt16BE(height,7);b.writeUInt16BE(width,9);return 'data:image/jpeg;base64,'+b.toString('base64');}
test('Jev never treats an unconditional Box as evidence of a defect',()=>{
 let d=fixture();assert.equal(normalize(d).verdict,'defect');assert.ok(normalize(d).box);
 for(const choice of ['clear','uncertain']){d=fixture();d.answers.decision.choice=choice;const result=normalize(d);assert.equal(result.verdict,'review');assert.equal(result.box,null);assert.equal(result.production_ready,false);}
 d=fixture();d.answers.decision.confidence=.5;assert.equal(normalize(d).box,null);
 d=fixture();d.answers.defect_type.choice='none';assert.equal(normalize(d).verdict,'review');
 d=fixture();d.answers.defect_box.box.right=2;assert.equal(normalize(d).box,null);
 d=fixture();d.answers.defect_box.box.left=.9;assert.equal(normalize(d).box,null);
 d=fixture();d.answers.decision.confidence='0.95';assert.throws(()=>normalize(d));
 for(const model of ['typesafe-ai/jev-1.14.0','jev-latest','jev-1.13.0']){d=fixture();d.model=model;assert.throws(()=>normalize(d));}
});
test('Jev API validates payloads and fixed destination; sanitizes errors and preserves missing-key state',async()=>{
 const gateway=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='unused-gateway-test';
 const oidc=process.env.VERCEL_OIDC_TOKEN;delete process.env.VERCEL_OIDC_TOKEN;
 const old=process.env.AI_JEV_API_KEY,originalFetch=global.fetch;let calls=0,payload;
 const request=async(method,body,headers={})=>{const res={headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(body){this.body=body;return this}};await handler({method,body,headers},res);return res;};
 try{
  delete process.env.AI_JEV_API_KEY;assert.equal((await request('GET')).body.configured,false);assert.equal((await request('DELETE')).code,405);
  assert.equal((await request('POST',{profile:'jev',image:jpeg()})).code,503);
  process.env.AI_JEV_API_KEY='test-only-secret';
  global.fetch=async(url,opts)=>{calls++;assert.equal(url,'https://api.typesafe.ai/v1/systemone');assert.equal(opts.headers['TypeSafe-Danger-Zone-Images'],'true');payload=JSON.parse(opts.body);return {ok:true,json:async()=>fixture()}};
  for(const body of [{profile:'mdf',image:jpeg()},{profile:'jev',image:'bad'},{profile:'jev',image:jpeg(224,224)},{profile:'jev',image:jpeg(),criteria:'x'.repeat(601)}])assert.ok((await request('POST',body)).code>=400);
  assert.equal((await request('POST',{profile:'jev',image:jpeg()},{host:'localhost:8766',origin:'https://other.example'})).code,403);assert.equal(calls,0);
  const result=await request('POST',{profile:'jev',image:jpeg(),objectName:'Tecido',criteria:'Falhas de costura'});
  assert.equal(result.code,200);assert.equal(result.body.image.width,448);assert.equal(result.body.experimental,true);assert.ok(!JSON.stringify(result.body).includes('test-only-secret'));
  assert.equal(payload.model,'jev-1.14.0');assert.equal(payload.state.object,'Tecido');assert.equal(Object.keys(payload.assets).length,1);
  global.fetch=async()=>({ok:false,status:401,json:async()=>({error:'test-only-secret'})});const error=await request('POST',{profile:'jev',image:jpeg()});assert.equal(error.code,502);assert.ok(!JSON.stringify(error).includes('test-only-secret'));
  global.fetch=async()=>({ok:true,json:async()=>({answers:{}})});assert.equal((await request('POST',{profile:'jev',image:jpeg()})).code,502);
  for(const status of [402,403,429]){let attempts=0;global.fetch=async()=>{attempts++;return {ok:false,status}};assert.equal((await request('POST',{profile:'jev',image:jpeg()})).code,status);assert.equal(attempts,1);}
  delete process.env.AI_JEV_API_KEY;process.env.VERCEL_OIDC_TOKEN='oidc-test';assert.equal((await request('POST',{profile:'jev',image:jpeg()})).code,503);
 }finally{if(gateway===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=gateway;if(oidc===undefined)delete process.env.VERCEL_OIDC_TOKEN;else process.env.VERCEL_OIDC_TOKEN=oidc;global.fetch=originalFetch;if(old===undefined)delete process.env.AI_JEV_API_KEY;else process.env.AI_JEV_API_KEY=old;}
});
