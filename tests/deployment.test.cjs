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
test('simple deployed access requires only a password and limits requests within each instance',async()=>{
 const names=['VERCEL','VQC_ENFORCE_ACCESS','VQC_REMOTE_ENABLED','VQC_ACCESS_PASSWORD','VQC_REQUESTS_PER_MINUTE','VQC_REQUESTS_PER_DAY','AI_GATEWAY_API_KEY','ROBOFLOW_API_KEY'];
 const saved=Object.fromEntries(names.map(n=>[n,process.env[n]])),fetchSaved=global.fetch,nowSaved=Date.now;
 const request={method:'POST',headers:{host:'test.example',origin:'https://test.example'}};
 let time=2000000000000;Date.now=()=>time;
 try{
  for(const n of names)delete process.env[n];process.env.VERCEL='1';
  global.fetch=()=>{throw Error('unexpected external request')};
  for(const handler of [jev,roboflow]){const r=res();await handler(request,r);assert.equal(r.code,503);}
  process.env.VQC_ACCESS_PASSWORD='short';assert.equal(authorize(request,res()),false);
  process.env.VQC_ACCESS_PASSWORD='a-test-password-long-enough';
  let r=res();assert.equal(authorize(request,r),false);assert.equal(r.code,401);
  request.headers.authorization='Basic '+Buffer.from('inspector:'+process.env.VQC_ACCESS_PASSWORD).toString('base64');
  assert.equal(authorize(request,res()),true); // No enable flag or Redis needed.
  const foreign={...request,headers:{...request.headers,origin:'https://evil.example'}};r=res();assert.equal(authorize(foreign,r),false);assert.equal(r.code,403);
  const reservations=await Promise.all(Array.from({length:7},()=>reserve(res())));
  assert.equal(reservations.filter(Boolean).length,6);
  r=res();assert.equal(await reserve(r),false);assert.equal(r.code,429);assert.ok(Number(r.headers['Retry-After'])>0);
  process.env.AI_GATEWAY_API_KEY='test-gateway';process.env.ROBOFLOW_API_KEY='test-roboflow';
  const jpeg=Buffer.from([255,216,255,192,0,8,8,1,192,1,192,1,255,217]);
  for(const [handler,profile] of [[jev,'jev'],[roboflow,'mdf']]){r=res();await handler({...request,body:{profile,image:'data:image/jpeg;base64,'+jpeg.toString('base64')}},r);assert.equal(r.code,429);}
  time+=60000;assert.equal(await reserve(res()),true);
  process.env.VQC_REQUESTS_PER_DAY='7';r=res();assert.equal(await reserve(r),false);assert.equal(r.code,429);assert.ok(Number(r.headers['Retry-After'])>60);
  time+=86400000;assert.equal(await reserve(res()),true);
  process.env.VQC_REQUESTS_PER_DAY='invalid';r=res();assert.equal(await reserve(r),false);assert.equal(r.code,503);
  process.env.VQC_REMOTE_ENABLED='false';r=res();assert.equal(authorize(request,r),false);assert.equal(r.code,503);
 }finally{Date.now=nowSaved;global.fetch=fetchSaved;for(const n of names){if(saved[n]===undefined)delete process.env[n];else process.env[n]=saved[n];}}
});
