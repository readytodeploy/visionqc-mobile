const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

test('frontend initializes and blocks every untrained product', async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;
 w.ResizeObserver=class{observe(){}};
 w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{}});
 w.localStorage.setItem('vqc_demo_autoload_disabled','1');
 w.eval(fs.readFileSync('js/app.js','utf8'));
 await new Promise(resolve=>setImmediate(resolve));
 const el=id=>w.document.getElementById(id);
 assert.match(el('lotName').textContent,/Molduras MDF/);
 assert.equal(el('operActions').querySelectorAll('button').length,1);
 assert.equal(el('operPrimary').textContent,'Capturar');
 assert.ok(el('settingsContent').contains(el('modoManual')));
 assert.ok(el('settingsContent').contains(el('modoAuto')));
 el('operMenu').click(); assert.equal(el('superScreen').hidden,false);
 assert.equal(el('settingsPane').hidden,false);
 assert.equal(el('operMenu').textContent.trim(),'Configurações');
 for(const profile of ['textile','mattress','sofa']){
  el('productProfile').value=profile;
  el('productProfile').dispatchEvent(new w.Event('change'));
  assert.equal(w.localStorage.getItem('vqc_inspection_profile'),profile);
  assert.equal(el('detectionProvider').disabled,true);
  assert.equal(el('operPrimary').textContent,'Capturar');
  assert.equal(el('modoAuto').disabled,true);
 }
 el('productProfile').value='mdf';el('productProfile').dispatchEvent(new w.Event('change'));
 assert.equal(el('detectionProvider').disabled,false);
 el('detectionProvider').value='local';el('detectionProvider').dispatchEvent(new w.Event('change'));
 assert.equal(el('modoAuto').disabled,false);
 el('modoAuto').click();assert.equal(el('modoAuto').getAttribute('aria-pressed'),'true');
 assert.equal(el('operPrimary').textContent,'Capturar');
 el('modoManual').click();assert.equal(el('modoManual').getAttribute('aria-pressed'),'true');
 for(const [model,profile,provider] of [['mdf_remote','mdf','roboflow'],['custom','custom','local'],['textile','textile','roboflow']]){
  el('evaluationModel').value=model;el('evaluationModel').dispatchEvent(new w.Event('change'));
  assert.equal(w.localStorage.getItem('vqc_inspection_profile'),profile);
  assert.equal(w.localStorage.getItem('vqc_detection_provider'),provider);
  assert.equal(el('localModelSettings').hidden,model!=='custom');
  assert.equal(el('remoteModelSettings').hidden,model!=='mdf_remote');
 }
 el('evaluationModel').value='custom';el('evaluationModel').dispatchEvent(new w.Event('change'));
 assert.equal(el('lotName').textContent,'Modelo próprio');
 assert.equal(el('modoAuto').disabled,false);
 assert.match(el('evaluationModelStatus').textContent,/aba Treino/);
 assert.ok(el('calPane').contains(el('localModelSettings')));
 for(const id of ['targetOK','targetKO','referenceMode','patchcoreMode','minSimilarity','minMargin'])assert.ok(el('calPane').contains(el(id)));
 assert.equal(el('settingsContent').contains(el('targetOK')),false);
 assert.equal(el('productProfileCard').hidden,true);

 dom.window.close();
});
