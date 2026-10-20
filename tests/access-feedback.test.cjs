const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
test('password action verifies access, reports failures and success, and hides empty lot',async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://example.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,el=id=>w.document.getElementById(id);
 w.TextEncoder=TextEncoder;w.ResizeObserver=class{observe(){}};
 w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{}});
 w.localStorage.setItem('vqc_demo_autoload_disabled','1');
 let code=401,configured=true,verified=true,offline=false,pendingResolve;
 w.fetch=async(url,opts)=>{
  assert.equal(url,'/api/jev');
  if(offline)throw Error('offline');
  assert.equal(opts.headers.Authorization,'Basic '+Buffer.from('inspector:test-password').toString('base64'));
  if(pendingResolve===true)return new Promise(resolve=>{pendingResolve=resolve;});
  return {ok:code===200,status:code,json:async()=>({configured,accessVerified:verified})};
 };
 w.eval(fs.readFileSync('js/access-client.js','utf8'));w.eval(fs.readFileSync('js/app.js','utf8'));
 const flush=()=>new Promise(r=>setImmediate(r));await flush();
 assert.equal(el('lotDetail').hidden,true);assert.equal(el('lotDetail').textContent,'');
 el('evaluationModel').value='jev';el('evaluationModel').dispatchEvent(new w.Event('change'));await flush();
 assert.equal(el('lotDetail').hidden,true);assert.ok(!el('operHead').textContent.includes('Sem lote definido'));
 el('inspectionUnlock').click();assert.match(el('inspectionAccessStatus').textContent,/Digite/);
 async function submit(){el('inspectionPassword').value='test-password';el('inspectionUnlock').click();await flush();assert.equal(el('inspectionPassword').value,'');assert.equal(el('inspectionUnlock').disabled,false);}
 await submit();assert.match(el('inspectionAccessStatus').textContent,/Senha incorreta/);assert.deepEqual(Object.keys(w.VQCAccess.headers()),[]);
 code=503;await submit();assert.match(el('inspectionAccessStatus').textContent,/bloqueado/);
 code=200;await submit();assert.match(el('inspectionAccessStatus').textContent,/Acesso liberado/);assert.equal(el('inspectionAccessStatus').dataset.state,'success');
 configured=false;await submit();assert.match(el('inspectionAccessStatus').textContent,/Falta configurar AI_JEV_API_KEY/);
 verified=false;await submit();assert.match(el('inspectionAccessStatus').textContent,/nem foi validada/);
 offline=true;await submit();assert.match(el('inspectionAccessStatus').textContent,/Falha/);offline=false;
 verified=true;configured=true;pendingResolve=true;el('inspectionPassword').value='test-password';el('inspectionUnlock').click();await flush();
 assert.equal(el('inspectionUnlock').disabled,true);el('inspectionLock').click();pendingResolve({ok:true,status:200,json:async()=>({configured:true,accessVerified:true})});await flush();
 assert.match(el('inspectionAccessStatus').textContent,/removido/);assert.deepEqual(Object.keys(w.VQCAccess.headers()),[]);
 assert.ok(!JSON.stringify(w.localStorage).includes('test-password'));
 dom.window.close();
});
