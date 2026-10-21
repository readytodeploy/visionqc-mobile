const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
test('Jev captures the full frame, avoids local training, renders review safely, and permits next capture',async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;const el=id=>w.document.getElementById(id);let count=0,lastBody,release;const draws=[];
 w.ResizeObserver=class{observe(){}};w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:(_,key)=>key==='drawImage'?((...args)=>draws.push(args)):(()=>{})});w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,/9j/2Q==';w.HTMLMediaElement.prototype.play=async()=>{};
 Object.defineProperty(w,'isSecureContext',{value:true});Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[],getVideoTracks:()=>[{getCapabilities:()=>({})}]})}});
 for(const [key,value] of Object.entries({readyState:4,videoWidth:1280,videoHeight:720}))Object.defineProperty(el('video'),key,{value});
 el('viewer').getBoundingClientRect=()=>({width:400,height:600});
 w.fetch=async(url,options)=>{
  assert.equal(url,'/api/jev');if(options?.method!=='POST')return {ok:true,json:async()=>({configured:false})};
  count++;lastBody=JSON.parse(options.body);
  if(count===1)await new Promise(resolve=>{release=resolve;});
  if(count===5)return {ok:true,json:async()=>({model:'jev-1.14.0',outcome:'no_apparent_defect',assessment:'clear',verdict:'review',reviewReason:'Sem defeito aparente na imagem analisada. Confirme visualmente.',confidence:.95,defectType:'Sem defeito visível',box:null,experimental:true,production_ready:false})};
  if(count===3)return {ok:false,status:401,json:async()=>({error:'Acesso restrito. Informe a senha em Configurações.'})};
  return {ok:true,json:async()=>({model:'jev-1.14.0',assessment:count===1?'clear':'defect',verdict:count===1?'review':'defect',outcome:count===1?'recapture':'possible_defect',reviewReason:count===1?'Refaça a captura: imagem desfocada.':null,confidence:.95,defectType:'Falha de costura',box:count===1?null:{left:.1,top:.2,right:.5,bottom:.7},experimental:true,production_ready:false})};
 };
 w.eval(fs.readFileSync('js/jev-client.js','utf8'));w.eval(fs.readFileSync('js/app.js','utf8'));await new Promise(r=>setImmediate(r));
 el('evaluationModel').value='jev';el('evaluationModel').dispatchEvent(new w.Event('change'));await new Promise(r=>setImmediate(r));
 assert.equal(el('jevSettings').hidden,false);assert.equal(el('localModelSettings').hidden,true);assert.equal(el('modoAuto').disabled,true);
 await el('operPrimary').onclick(); // Camera; no MobileNet loaded.
 const pending=el('operPrimary').onclick(); // Analyze ROI, held until assertions below.
 await new Promise(r=>setImmediate(r));
 assert.equal(el('operPrimary').disabled,true);assert.equal(el('operPrimary').textContent,'Analisando…');
 assert.equal(el('operStatus').dataset.state,'pending');assert.equal(el('operStatus').parentElement.id,'operActions');assert.match(el('operStatus').textContent,/Analisando imagem inteira/);
 assert.ok(el('inspectionSnapshot'));assert.equal(el('inspectionSnapshot').style.height,'225px');assert.equal(el('inspectionSnapshot').style.top,'187.5px');release();await pending;
 assert.equal(el('operPrimary').disabled,false);assert.equal(el('operStatus').dataset.state,'result');
 assert.equal(count,1);assert.equal(lastBody.profile,'jev');assert.equal(el('frame').width,1280);assert.equal(el('frame').height,720);assert.ok(draws.some(args=>args[0]===el('video')&&JSON.stringify(args.slice(1))===JSON.stringify([0,0,1280,720,0,0,1280,720])));
 assert.equal(el('vText').textContent,'REFAÇA A CAPTURA');assert.match(el('vScore').textContent,/imagem desfocada/);assert.ok(!el('vScore').textContent.includes('Sem defeito aparente'));assert.equal(el('remoteBoxes').children.length,0);assert.ok(el('inspectionSnapshot'));assert.equal(el('inspectionSnapshot').style.width,'400px');
 await el('operPrimary').onclick();assert.equal(count,2);assert.equal(el('vText').textContent,'POSSÍVEL DEFEITO');assert.equal(el('remoteBoxes').children.length,1);
 assert.equal(el('remoteBoxes').firstChild.style.left,'40px');assert.equal(el('remoteBoxes').firstChild.style.top,'232.5px');assert.match(el('remoteSummary').textContent,/Ampliar região sugerida/);
 await el('operPrimary').onclick(); // Provider rejects authentication.
 assert.equal(count,3);assert.equal(el('operStatus').dataset.state,'error');assert.match(el('operStatus').textContent,/Acesso restrito/);
 assert.equal(el('verdictPanel').hidden,true);assert.equal(el('operPrimary').disabled,false);assert.equal(el('operPrimary').textContent,'Capturar');
 // Dismissing the transient toast must not discard the persistent error.
 el('toast').hidden=true;assert.match(el('operStatus').textContent,/Acesso restrito/);
 await el('operPrimary').onclick();assert.equal(count,4);assert.equal(el('verdictPanel').hidden,false);
 await el('operPrimary').onclick();assert.equal(count,5);assert.equal(el('vText').textContent,'SEM DEFEITO APARENTE');assert.ok(el('verdictPanel').classList.contains('no-apparent-defect'));assert.equal(el('remoteBoxes').children.length,0);assert.ok(!el('verdictPanel').classList.contains('good'));
 dom.window.close();
});
