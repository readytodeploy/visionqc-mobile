const {test}=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/roboflow.js');

test('API enforces methods, configuration, profile and payload safety',async()=>{
 const saved=process.env.ROBOFLOW_API_KEY, fetchSaved=global.fetch;
 let calls=0;
 global.fetch=async()=>{calls++;return {ok:true,json:async()=>({predictions:[],image:{width:448,height:448}})}};
 async function request(method,body){const res={headers:{},setHeader(k,v){this.headers[k]=v},status(s){this.code=s;return this},json(body){this.body=body;return this}};await handler({method,body},res);return res}
 try{
  delete process.env.ROBOFLOW_API_KEY;
  assert.equal((await request('GET')).code,405);
  assert.equal((await request('POST',{})).code,503);
  process.env.ROBOFLOW_API_KEY='test-only-key';
  for(const profile of ['textile','mattress','sofa','unknown'])assert.equal((await request('POST',{profile})).code,409);
  for(const image of [null,'data:image/png;base64,AAAA','x'.repeat(1800001)])assert.equal((await request('POST',{image})).code,400);
  const image='data:image/jpeg;base64,/9j/2Q==';
  for(const confidence of [0,96,'invalid'])assert.equal((await request('POST',{image,confidence})).code,400);
  assert.equal(calls,0);
  const result=await request('POST',{image,confidence:50,profile:'mdf'});
  assert.equal(result.code,200);assert.deepEqual(result.body.predictions,[]);
  assert.equal(result.headers['Cache-Control'],'no-store');
  assert.ok(!JSON.stringify(result.body).includes('test-only-key'));
 }finally{global.fetch=fetchSaved;if(saved===undefined)delete process.env.ROBOFLOW_API_KEY;else process.env.ROBOFLOW_API_KEY=saved}
});
