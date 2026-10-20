const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
test('Jev captures ROI, avoids local training, renders review safely, and permits next capture',async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;const el=id=>w.document.getElementById(id);let count=0,lastBody,release;
 w.ResizeObserver=class{observe(){}};w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{}});w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,/9j/2Q==';w.HTMLMediaElement.prototype.play=async()=>{};
 Object.defineProperty(w,'isSecureContext',{value:true});Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[],getVideoTracks:()=>[{getCapabilities:()=>({})}]})}});
 for(const [key,value] of Object.entries({readyState:4,videoWidth:1280,videoHeight:720}))Object.defineProperty(el('video'),key,{value});
 el('viewer').getBoundingClientRect=()=>({width:400,height:600});
 w.fetch=async(url,options)=>{
  assert.equal(url,'/api/jev');if(options?.method!=='POST')return {ok:true,json:async()=>({configured:false})};
  count++;lastBody=JSON.parse(options.body);
  if(count===1)await new Promise(resolve=>{release=resolve;});
  if(count===3)return {ok:false,status:401,json:async()=>({error:'Acesso restrito. Informe a senha em Configurações.'})};
  return {ok:true,json:async()=>({model:'jev-1.14.0',assessment:count===1?'clear':'defect',verdict:count===1?'review':'defect',confidence:.95,defectType:'Falha de costura',box:count===1?null:{left:.1,top:.2,right:.5,bottom:.7},experimental:true,production_ready:false})};
 };
 w.eval(fs.readFileSync('js/jev-client.js','utf8'));w.eval(fs.readFileSync('js/app.js','utf8'));await new Promise(r=>setImmediate(r));
 el('evaluationModel').value='jev';el('evaluationModel').dispatchEvent(new w.Event('change'));await new Promise(r=>setImmediate(r));
 assert.equal(el('jevSettings').hidden,false);assert.equal(el('localModelSettings').hidden,true);assert.equal(el('modoAuto').disabled,true);
 await el('operPrimary').onclick(); // Camera; no MobileNet loaded.
 const pending=el('operPrimary').onclick(); // Analyze ROI, held until assertions below.
 await new Promise(r=>setImmediate(r));
 assert.equal(el('operPrimary').disabled,true);assert.equal(el('operPrimary').textContent,'Analisando…');
 assert.equal(el('operStatus').dataset.state,'pending');assert.equal(el('operStatus').parentElement.id,'operActions');assert.match(el('operStatus').textContent,/Enviando captura/);
 release();await pending;
 assert.equal(el('operPrimary').disabled,false);assert.equal(el('operStatus').dataset.state,'result');
 assert.equal(count,1);assert.equal(lastBody.profile,'jev');assert.equal(el('frame').width,448);assert.equal(el('frame').height,448);
 assert.equal(el('vText').textContent,'REVISAR PEÇA');assert.equal(el('remoteBoxes').children.length,0);assert.ok(el('inspectionSnapshot'));assert.equal(el('inspectionSnapshot').style.width,'288px');
 await el('operPrimary').onclick();assert.equal(count,1);assert.equal(el('verdictPanel').hidden,true);assert.equal(el('inspectionSnapshot'),null);
 await el('operPrimary').onclick();assert.equal(count,2);assert.equal(el('vText').textContent,'POSSÍVEL DEFEITO');assert.equal(el('remoteBoxes').children.length,1);
 assert.equal(el('remoteBoxes').firstChild.style.left,'84.8px');
 await el('operPrimary').onclick(); // Release the previous result.
 await el('operPrimary').onclick(); // Provider rejects authentication.
 assert.equal(count,3);assert.equal(el('operStatus').dataset.state,'error');assert.match(el('operStatus').textContent,/Acesso restrito/);
 assert.equal(el('verdictPanel').hidden,true);assert.equal(el('operPrimary').disabled,false);assert.equal(el('operPrimary').textContent,'Capturar');
 // Dismissing the transient toast must not discard the persistent error.
 el('toast').hidden=true;assert.match(el('operStatus').textContent,/Acesso restrito/);
 await el('operPrimary').onclick();assert.equal(count,4);assert.equal(el('verdictPanel').hidden,false);
 dom.window.close();
});
