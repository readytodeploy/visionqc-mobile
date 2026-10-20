const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const {execFileSync}=require('node:child_process');
const {authorize,reserve}=require('../api/lib/access-policy');
const jev=require('../api/jev');const roboflow=require('../api/roboflow');
const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(body){this.body=body;return this}});
test('public build includes only runtime assets, never secrets, datasets or research',()=>{
 execFileSync(process.execPath,['scripts/build-web.cjs']);
 const files=fs.readdirSync('dist',{recursive:true}).filter(f=>fs.statSync('dist/'+f).isFile()).sort();
 assert.deepEqual(files,['assets/styles.css','config/model-profiles.json','index.html','js/access-client.js','js/app.js','js/jev-client.js','js/product-vision.js','js/reference-mode.js','js/roboflow-client.js']);
 const config=require('../vercel.json');assert.equal(config.outputDirectory,'dist');assert.equal(config.buildCommand,'npm run build');
});
test('deployed APIs fail closed and enforce shared quotas before any inference',async()=>{
 const names=['VERCEL','VQC_REMOTE_ENABLED','VQC_ACCESS_PASSWORD','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','VQC_REQUESTS_PER_MINUTE','VQC_REQUESTS_PER_DAY','AI_GATEWAY_API_KEY','ROBOFLOW_API_KEY'];
 const saved=Object.fromEntries(names.map(n=>[n,process.env[n]])),fetchSaved=global.fetch;
 const request={method:'POST',headers:{host:'test.example',origin:'https://test.example'}};
 try{
  for(const n of names)delete process.env[n];process.env.VERCEL='1';
  global.fetch=()=>{throw Error('unexpected external request')};
  for(const handler of [jev,roboflow]){const r=res();await handler(request,r);assert.equal(r.code,503);}
  process.env.VQC_REMOTE_ENABLED='true';process.env.VQC_ACCESS_PASSWORD='a-test-password-long-enough';
  let r=res();assert.equal(authorize(request,r),false);assert.equal(r.code,401);
  request.headers.authorization='Basic '+Buffer.from('inspector:'+process.env.VQC_ACCESS_PASSWORD).toString('base64');
  assert.equal(authorize(request,res()),true);
  const foreign={...request,headers:{...request.headers,origin:'https://evil.example'}};r=res();assert.equal(authorize(foreign,r),false);assert.equal(r.code,403);
  r=res();assert.equal(await reserve(r),false);assert.equal(r.code,503);
  process.env.UPSTASH_REDIS_REST_URL='https://test.upstash.io';process.env.UPSTASH_REDIS_REST_TOKEN='redis-secret';
  let commands=[];global.fetch=async(url,opts)=>{assert.equal(url,'https://test.upstash.io/');commands.push(JSON.parse(opts.body));return {ok:true,json:async()=>({result:[1,0]})}};
  assert.equal(await reserve(res()),true);assert.equal(commands[0][0],'EVAL');assert.equal(commands[0][3].startsWith('vqc:inspection:minute:'),true);assert.deepEqual(commands[0].slice(5,7),['6','60']);
  global.fetch=async()=>({ok:true,json:async()=>({result:[0,42]})});r=res();assert.equal(await reserve(r),false);assert.equal(r.code,429);assert.equal(r.headers['Retry-After'],'42');
  global.fetch=async()=>({ok:true,json:async()=>({result:'bad'})});r=res();assert.equal(await reserve(r),false);assert.equal(r.code,503);
  process.env.AI_GATEWAY_API_KEY='test-gateway';process.env.ROBOFLOW_API_KEY='test-roboflow';
  const jpeg=Buffer.from([255,216,255,192,0,8,8,1,192,1,192,1,255,217]);
  global.fetch=async(url)=>{assert.equal(String(url),'https://test.upstash.io/');return {ok:true,json:async()=>({result:[0,42]})}};
  for(const [handler,profile] of [[jev,'jev'],[roboflow,'mdf']]){r=res();await handler({...request,body:{profile,image:'data:image/jpeg;base64,'+jpeg.toString('base64')}},r);assert.equal(r.code,429);}
  process.env.VQC_REQUESTS_PER_DAY='invalid';r=res();assert.equal(await reserve(r),false);assert.equal(r.code,503);
  process.env.VQC_REMOTE_ENABLED='false';r=res();assert.equal(authorize(request,r),false);assert.equal(r.code,503);
 }finally{global.fetch=fetchSaved;for(const n of names){if(saved[n]===undefined)delete process.env[n];else process.env[n]=saved[n];}}
});
