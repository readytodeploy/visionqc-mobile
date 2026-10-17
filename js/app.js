(()=>{'use strict';
const $=id=>document.getElementById(id),st={stream:null,model:null,loading:false,busy:false,auto:false,loop:null,session:0,records:[],history:[],background:[],empty:true,presentRun:0,emptyRun:0,pieceRecorded:false,pending:null,quality:null,lastGray:null,audio:null,silent:true,torch:false,threshold:.8,margin:.035,count:0,koCount:0,autoBusy:false,validationKey:''};
const DB='visionqc-v3',STORE='records',HISTORY='history';let db=null;const ROI={x:.19,y:.19,w:.62,h:.62};const PARTS=10,FRAMES=3,MIN_STABLE=3,MIN_EMPTY=3;
/* [MEJORA-3] Captura y retícula calculadas con el mismo rectángulo ROI y object-fit cover. */
/* [MEJORA-34] ROI cuadrado idéntico en visor, calibración y pantalla completa. */
function geometry(){const v=$('video'),view=$('viewer').getBoundingClientRect(),vw=v.videoWidth||1280,vh=v.videoHeight||720,cw=view.width,ch=view.height,scale=Math.max(cw/vw,ch/vh),ox=(cw-vw*scale)/2,oy=(ch-vh*scale)/2,side=Math.min(cw,ch)*.72;const r={x:(cw-side)/2,y:(ch-side)/2,w:side,h:side},size=side/scale;return {r,cw,ch,source:{x:Math.max(0,(r.x-ox)/scale),y:Math.max(0,(r.y-oy)/scale),w:Math.min(vw,size),h:Math.min(vh,size)}}}

function drawGuide(){const canvas=$('overlay'),g=geometry(),ratio=window.devicePixelRatio||1;canvas.width=Math.round(g.cw*ratio);canvas.height=Math.round(g.ch*ratio);const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);const r=g.r;ctx.strokeStyle='rgba(248,253,255,.86)';ctx.lineWidth=3;const k=Math.min(30,r.w*.14,r.h*.14);for(const [x,y,sx,sy] of [[r.x,r.y,1,1],[r.x+r.w,r.y,-1,1],[r.x,r.y+r.h,1,-1],[r.x+r.w,r.y+r.h,-1,-1]]){ctx.beginPath();ctx.moveTo(x+k*sx,y);ctx.lineTo(x,y);ctx.lineTo(x,y+k*sy);ctx.stroke()}}
function capture(){const v=$('video');if(!st.stream||v.readyState<2)throw Error('La cámara todavía no tiene una imagen disponible.');const {source}=geometry(),c=$('frame');c.width=448;c.height=448;c.getContext('2d',{willReadFrequently:true}).drawImage(v,source.x,source.y,source.w,source.h,0,0,448,448);return c}
/* [MEJORA-4] Calidad de imagen 128×128: brillo, varianza de Laplaciano y movimiento entre fotogramas. */
function quality(c){const o=document.createElement('canvas');o.width=o.height=128;const ctx=o.getContext('2d',{willReadFrequently:true});ctx.drawImage(c,0,0,128,128);const d=ctx.getImageData(0,0,128,128).data,g=new Float32Array(16384);let m=0,q=0,motion=0;for(let i=0;i<g.length;i++){const p=i*4,z=.299*d[p]+.587*d[p+1]+.114*d[p+2];g[i]=z;m+=z;q+=z*z;if(st.lastGray)motion+=Math.abs(st.lastGray[i]-z)}m/=g.length;const contrast=Math.sqrt(Math.max(0,q/g.length-m*m));motion=st.lastGray?motion/g.length:0;let lap=0,square=0,n=0;for(let y=1;y<127;y++)for(let x=1;x<127;x++){const i=y*128+x,z=4*g[i]-g[i-1]-g[i+1]-g[i-128]-g[i+128];lap+=z;square+=z*z;n++}const sharp=Math.max(0,square/n-(lap/n)**2);st.lastGray=g;const okLight=m>=35&&m<=230&&contrast>=9,okSharp=sharp>=26,okMotion=motion<16;return {ok:okLight&&okSharp&&okMotion,light:okLight,sharp:okSharp,motion:okMotion,values:{m,contrast,sharp,motion},reason:!okLight?'Mejora la iluminación o reduce los reflejos.':!okSharp?'La pieza aparece desenfocada. Acércala o estabiliza el teléfono.':!okMotion?'La pieza se está moviendo. Espera a que se estabilice.':''}}
function qualityUI(q){$('lightQuality').innerHTML='Luz: <strong>'+(q.light?'Bien':'Revisar')+'</strong>';$('sharpQuality').innerHTML='Nitidez: <strong>'+(q.sharp?'Bien':'Revisar')+'</strong>';$('motionQuality').innerHTML='Movimiento: <strong>'+(q.motion?'Estable':'Alto')+'</strong>';['lightQuality','sharpQuality','motionQuality'].forEach((id,i)=>$(id).classList.toggle('fail',![q.light,q.sharp,q.motion][i]))}
function vecNorm(v){let n=0;for(let i=0;i<v.length;i++)n+=v[i]*v[i];n=Math.sqrt(n)||1;return Array.from(v,x=>x/n)}
function cosine(a,b){let v=0;for(let i=0;i<a.length;i++)v+=a[i]*b[i];return v}
function average(vectors){const a=new Float32Array(vectors[0].length);for(const v of vectors)for(let i=0;i<a.length;i++)a[i]+=v[i]/vectors.length;return vecNorm(a)}
/* [MEJORA-5] Embedding global + rejilla 3×3. Se reduce cada imagen a 224 dentro del modelo, pero ROI fuente es 448. */
function embedding(c){const patch=document.createElement('canvas');patch.width=patch.height=224;const ctx=patch.getContext('2d');const parts=[];for(let p=0;p<PARTS;p++){const x=p===0?0:((p-1)%3)*c.width/3,y=p===0?0:Math.floor((p-1)/3)*c.height/3,w=p===0?c.width:c.width/3;ctx.clearRect(0,0,224,224);ctx.drawImage(c,x,y,w,w,0,0,224,224);const t=st.model.infer(patch,true);try{parts.push(vecNorm(t.dataSync()))}finally{t.dispose()}}return parts}
/* [MEJORA-26] Coincidencia espacial tolerante: cada parche puede moverse a celdas vecinas.
   Combinamos rasgos globales para identidad y peores regiones para anomalías locales.
   No es invarianza completa ante perspectivas ni garantía de microdefectos. */
function patchMatches(a,b){
 const local=[];
 for(let i=1;i<PARTS;i++){
   const x=(i-1)%3,y=Math.floor((i-1)/3);let best=-1;
   for(let j=1;j<PARTS;j++){
     const dx=Math.abs(x-(j-1)%3),dy=Math.abs(y-Math.floor((j-1)/3));
     if(dx<=1&&dy<=1) best=Math.max(best,cosine(a[i],b[j])-.012*(dx+dy));
   }
   local.push(best);
 }
 return local;
}
function similarity(a,b){
 const global=cosine(a[0],b[0]),ab=patchMatches(a,b),ba=patchMatches(b,a);
 const mean=(ab.reduce((v,x)=>v+x,0)+ba.reduce((v,x)=>v+x,0))/18;
 const worst=Math.min(...ab,...ba);
 return .42*global+.43*mean+.15*worst;
}
function aggregate(frames){return Array.from({length:PARTS},(_,p)=>average(frames.map(f=>f[p])))}
/* [MEJORA-6] KNN ponderado por distancia y normalizado por cantidad de ejemplos por clase. */
function classify(emb,records=st.records,excludedId=null){const list=records.filter(r=>r.id!==excludedId);if(!list.length)return {label:'uncertain',score:0,margin:0};const ranks=list.map(r=>({label:r.label,sim:similarity(emb,r.emb)})).sort((a,b)=>b.sim-a.sim);const counts={ok:0,ko:0,bg:0};for(const r of list)counts[r.label]++;const weights={ok:0,ko:0,bg:0};for(const a of ranks.slice(0,Math.min(12,ranks.length))){const w=Math.pow(Math.max(0,a.sim),12)/(Math.sqrt(counts[a.label]||1));weights[a.label]+=w}let labels=Object.keys(weights).filter(x=>counts[x]).sort((a,b)=>weights[b]-weights[a]);const best=labels[0]||'uncertain';const bestScore=Math.max(...ranks.filter(r=>r.label===best).map(r=>r.sim));const alt=Math.max(-1,...ranks.filter(r=>r.label!==best).map(r=>r.sim));const margin=bestScore-alt;const diff=(weights[best]-(weights[labels[1]]||0))/(weights[best]+(weights[labels[1]]||0)+1e-9);return {label:best,score:bestScore,margin,vote:diff,ranks}}
function needs(){return {ok:limit($('targetOK').value),ko:limit($('targetKO').value)}}function limit(x){return Math.min(200,Math.max(1,Math.floor(Number(x)||10)))}function count(cls){return st.records.filter(r=>r.label===cls&&!r.synthetic).length}function trained(){const n=needs();return count('ok')>=n.ok&&count('ko')>=n.ko&&count('bg')>0}
/* [MEJORA-7] Validación leave-one-out y sugerencias de umbrales: heurísticas, no prueba externa. */
function validation(){const key=st.records.map(r=>r.id).join('|')+'#'+$('autoThreshold').checked;if(st.validationKey===key)return;st.validationKey=key;const ok=st.records.filter(r=>r.label==='ok'&&!r.synthetic).length,ko=st.records.filter(r=>r.label==='ko'&&!r.synthetic).length;if(ok<5||ko<5){$('validation').textContent='Validación disponible al alcanzar 5 ejemplos reales por clase.';return}let tp=0,fp=0,fn=0,tn=0;const scored=[];for(const r of st.records.filter(x=>x.label!=='bg'&&!x.synthetic)){const p=classify(r.emb,st.records,r.id);scored.push({...p,correct:p.label===r.label});if(r.label==='ko'&&p.label==='ko')tp++;else if(r.label==='ok'&&p.label==='ko')fp++;else if(r.label==='ko')fn++;else tn++}const precision=tp+fp?tp/(tp+fp):0,recall=tp+fn?tp/(tp+fn):0;const correct=scored.filter(x=>x.correct);if(correct.length){const quantile=(v,p)=>{const sorted=v.slice().sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)]};const minS=quantile(correct.map(x=>x.score),.05),minM=quantile(correct.map(x=>x.margin),.05);st.threshold=Math.max(.4,Math.min(.95,minS-.015));st.margin=Math.max(0,Math.min(.2,minM-.01));if($('autoThreshold').checked){$('minSimilarity').value=st.threshold.toFixed(3);$('minMargin').value=st.margin.toFixed(3)}}$('validation').innerHTML=`Leave-one-out (KO positivo): TP ${tp} · FP ${fp} · FN ${fn} · TN ${tn}<br>Precisión ${(100*precision).toFixed(1)}% · Recall ${(100*recall).toFixed(1)}%<br>Umbrales sugeridos: similitud ${st.threshold.toFixed(3)}, separación ${st.margin.toFixed(3)}. Evaluación sobre el mismo dataset: no sustituye pruebas independientes.`}
function diversity(label,emb){const peers=st.records.filter(r=>r.label===label);if(peers.length<2)return '';const nearest=Math.max(...peers.map(r=>similarity(r.emb,emb)));return nearest>.995?'Muestra muy similar: captura otra distancia, cara, orientación o un detalle distinto del mismo producto.':''}
/* [MEJORA-8] Aumento ligero opcional sin entrenar pesos: nuevos embeddings tras flip/brillo/traslación. */
/* [MEJORA-27] Aumento multi-escala y pequeñas rotaciones; protege contra distancia y
   orientación moderadamente distintas, sin fingir que una toma revela todas las caras. */
function augmented(c){
 const out=[],size=448;
 for(const [angle,scale,bright,flip] of [[-9,1.06,.95,false],[9,.94,1.06,false],[0,1.17,1,false],[0,.84,1,false],[0,1,1,true]]){
  const copy=document.createElement('canvas');copy.width=copy.height=size;
  const ctx=copy.getContext('2d');ctx.fillStyle='#20242a';ctx.fillRect(0,0,size,size);
  ctx.save();ctx.translate(size/2,size/2);ctx.rotate(angle*Math.PI/180);
  ctx.scale((flip?-1:1)*scale,scale);
  ctx.drawImage(c,-size/2,-size/2,size,size);ctx.restore();
  if(bright!==1){const d=ctx.getImageData(0,0,size,size);for(let i=0;i<d.data.length;i+=4){d.data[i]=Math.min(255,d.data[i]*bright);d.data[i+1]=Math.min(255,d.data[i+1]*bright);d.data[i+2]=Math.min(255,d.data[i+2]*bright)}ctx.putImageData(d,0,0)}
  out.push(embedding(copy));
 }
 return out;
}
function dataURI(c){return c.toDataURL('image/jpeg',.43)}
/* [MEJORA-9] IndexedDB: vectores, etiquetas, minifotos e historial; import/export local. */
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{const d=req.result;d.createObjectStore(STORE,{keyPath:'id'});d.createObjectStore(HISTORY,{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function transaction(store,mode,fn){return new Promise((resolve,reject)=>{if(!db){resolve(null);return}const tx=db.transaction(store,mode),object=tx.objectStore(store),r=fn(object);tx.oncomplete=()=>resolve(r?.result);tx.onerror=()=>reject(tx.error)})}
async function restore(){try{db=await openDB();st.records=await transaction(STORE,'readonly',o=>o.getAll())||[];st.bgTiny=null;const background=st.records.find(r=>r.label==='bg'&&r.thumb);if(background){const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=64;canvas.getContext('2d').drawImage(img,0,0,64,64);st.bgTiny=tiny(canvas)};img.src=background.thumb}st.validationKey='';st.history=(await transaction(HISTORY,'readonly',o=>o.getAll())||[]).sort((a,b)=>b.at-a.at);$('targetOK').value=localStorage.getItem('vqc_ok')||10;$('targetKO').value=localStorage.getItem('vqc_ko')||10;const totals=loadCounts();st.count=totals.n;st.koCount=totals.ko;refresh()}catch(e){toast('No se pudo restaurar IndexedDB: se trabajará solo en esta sesión.')}}
async function storeRecord(record){st.records.push(record);st.validationKey='';try{await transaction(STORE,'readwrite',o=>o.put(record))}catch(e){toast('Sin espacio para guardar muestras. Exporta tu calibración.')}refresh()}
async function storeHistory(h){st.history.unshift(h);if(st.history.length>150){const removed=st.history.pop();await transaction(HISTORY,'readwrite',o=>o.delete(removed.id))}await transaction(HISTORY,'readwrite',o=>o.put(h));historyUI()}
/* [MEJORA-35] Contadores fuera del histórico limitado. */
const COUNTS_KEY='vqc_counts';
function loadCounts(){try{const r=JSON.parse(localStorage.getItem(COUNTS_KEY));if(r&&Number.isFinite(r.n)&&Number.isFinite(r.ko))return r}catch(e){}return {n:0,ko:0}}
function bump(label){const c=loadCounts();c.n++;if(label==='ko')c.ko++;localStorage.setItem(COUNTS_KEY,JSON.stringify(c));st.count=c.n;st.koCount=c.ko}
function id(){return crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2)}
function download(content,name,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
/* [MEJORA-10] El ciclo vacío→presente estable→vacío es el único contador automático. */
/* [MEJORA-36] Comparación RGB→gris de bajo coste antes de MobileNet. */
function tiny(c){const o=tiny.canvas||(tiny.canvas=document.createElement('canvas'));o.width=o.height=32;const x=o.getContext('2d',{willReadFrequently:true});x.drawImage(c,0,0,32,32);const d=x.getImageData(0,0,32,32).data,g=new Float32Array(1024);for(let i=0;i<1024;i++)g[i]=.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2];return g}
function pixDiff(a,b){let sum=0;for(let i=0;i<1024;i++)sum+=Math.abs(a[i]-b[i]);return sum/1024}
function presence(emb){const b=st.records.filter(x=>x.label==='bg');if(!b.length)return null;return Math.max(...b.map(r=>similarity(emb,r.emb)))}
function newResult(label,score=null,text=''){presentOperatorVerdict(label,score);const elem=$('result'),v=$('viewer');elem.className='result';v.classList.remove('good','bad','uncertain');const mode=label==='ok'?'good':label==='ko'?'bad':label==='uncertain'?'uncertain':'';if(mode){elem.classList.add(mode);v.classList.add(mode)}$('verdict').textContent=label==='ok'?'✓ OK':label==='ko'?'✕ KO':label==='uncertain'?'! INCIERTO':'SIN ANALIZAR';$('score').textContent=text||(score===null?'Esperando inspección':`Similitud ${(score*100).toFixed(1)}%`)}
function beep(label){if(st.silent)return;try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;st.audio=st.audio||new A();st.audio.resume();const osc=st.audio.createOscillator(),gain=st.audio.createGain(),now=st.audio.currentTime;osc.type='sine';osc.frequency.value=label==='ok'?820:label==='ko'?280:530;gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.075,now+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+.18);osc.connect(gain);gain.connect(st.audio.destination);osc.start(now);osc.stop(now+.2)}catch(e){}}
function flash(label){const v=$('viewer');v.classList.remove('flash');void v.offsetWidth;v.classList.add('flash');beep(label)}
function toast(msg){if(msg&&document.getElementById('operStatus'))document.getElementById('operStatus').textContent=msg.slice(0,90);$('toast').textContent=msg;$('toast').hidden=!msg;clearTimeout(st.toastTimer);if(msg)st.toastTimer=setTimeout(()=>$('toast').hidden=true,6500)}
/* [MEJORA-37] PatchCore Lite, banco de parches OK, distancia coseno y coreset limitado.
  Alternativa funcional inspirada en PatchCore; NO usa backbone multiescala Anomalib ni ONNX. */
const patchState={signature:'',bank:[],threshold:.13,referenceCount:0};
function patchEnabled(){return $('patchcoreMode').checked}
function patchDistance(a,b){return Math.max(0,1-cosine(a,b))}
function patchSignature(){return st.records.filter(r=>r.label==='ok'&&!r.synthetic).map(r=>r.id).join('|')}
function buildPatchBank(){
 const signature=patchSignature();if(signature===patchState.signature)return;
 const examples=st.records.filter(r=>r.label==='ok'&&!r.synthetic);
 const bank=[];const maxSamples=40;
 const stride=Math.max(1,Math.ceil(examples.length/maxSamples));
 for(let n=0;n<examples.length;n+=stride)for(let i=1;i<PARTS;i++)bank.push(examples[n].emb[i]);
 patchState.bank=bank;patchState.referenceCount=examples.length;patchState.signature=signature;
 // La calibración leave-one-out usa otras imágenes OK, nunca el parche de la misma muestra.
 const values=[];
 const subset=examples.filter((_,i)=>i%Math.max(1,Math.ceil(examples.length/32))===0);
 for(const r of subset){
  const others=examples.filter(x=>x.id!==r.id);
  if(!others.length)break;
  const pool=others.flatMap(x=>x.emb.slice(1));
  const d=r.emb.slice(1).map(p=>Math.min(...pool.map(q=>patchDistance(p,q))));
  values.push(d.sort((a,b)=>b-a)[Math.min(1,d.length-1)]);
 }
 values.sort((a,b)=>a-b);
 // Percentil alto de divergencia entre piezas OK, con un margen operativo.
 patchState.threshold=values.length>=3?Math.max(.035,Math.min(.45,values[Math.floor((values.length-1)*.95)]*1.15)):.13;
}
function patchPredict(emb){
 buildPatchBank();
 if(patchState.referenceCount<3||!patchState.bank.length)return {label:'uncertain',score:0,anomaly:0,reason:'Se necesitan al menos 3 muestras OK reales para activar PatchCore Lite.'};
 const distances=emb.slice(1).map(p=>{let best=Infinity;for(const q of patchState.bank)best=Math.min(best,patchDistance(p,q));return best});
 distances.sort((a,b)=>b-a);
 const anomaly=distances.slice(0,2).reduce((a,b)=>a+b,0)/2;
 const threshold=patchState.threshold*Number($('patchSensitivity').value);
 const gray=threshold*.12;
 const label=anomaly>threshold+gray?'ko':anomaly<threshold-gray?'ok':'uncertain';
 return {label,score:Math.max(0,1-anomaly),anomaly,threshold};
}
function referenceEnabled(){return document.getElementById('referenceMode')?.checked===true}
function predictionFor(emb){return referenceEnabled()?window.VQCReference.predict(emb,st.records,$('referenceSensitivity').value):patchEnabled()?patchPredict(emb):classify(emb)}
/* La producción solo inicia tras confirmar explícitamente el conjunto de entrenamiento. */
const APPROVAL_KEY='vqc_training_approved_v1';
function calibrationFingerprint(){
 return [referenceEnabled()?'reference':patchEnabled()?'patch':'knn',needs().ok,needs().ko,
 st.records.filter(r=>!r.synthetic).map(r=>r.id+':'+r.label).join('|')].join('#');
}
function approvalValid(){return localStorage.getItem(APPROVAL_KEY)===calibrationFingerprint()}
function approveTraining(){
 if(!calibrationComplete()){toast('Completa el fondo y las muestras antes de confirmar.');return}
 localStorage.setItem(APPROVAL_KEY,calibrationFingerprint());
 hideOperatorVerdict();leaveSupervisor();updateOperator();
 u('operStatus').textContent='Listo para inspeccionar';
}
function calibrationComplete(){return !!st.model&&(referenceEnabled()?(count('ok')>=1&&count('bg')>0):patchEnabled()?(count('ok')>=3&&count('bg')>0):trained())}
function ready(){return approvalValid()&&!!st.stream&&!!st.model&&(referenceEnabled()?(count('ok')>=1&&count('bg')>0):patchEnabled()?(count('ok')>=3&&count('bg')>0):trained())}
function refresh(){const n=needs(),o=count('ok'),k=count('ko'),b=count('bg');$('okN').textContent=`${o} / ${n.ok}`;$('koN').textContent=`${k} / ${n.ko}`;$('okBar').style.width=Math.min(100,o/n.ok*100)+'%';$('koBar').style.width=Math.min(100,k/n.ko*100)+'%';$('trainingBadge').textContent=`${o+k} piezas · ${b?'Fondo ✓':'Fondo pendiente'}`;const stage=!st.stream?1:!ready()?2:3; if(patchEnabled()){buildPatchBank();$('patchStatus').textContent='PatchCore Lite · '+patchState.referenceCount+' muestras OK · '+patchState.bank.length+' parches · Umbral '+patchState.threshold.toFixed(3);}$('stepLabel').textContent=`PASO ${stage} / 3`;$('stepText').textContent=stage===1?'Activar cámara':stage===2?'Calibrar IA':'Inspeccionar piezas';$('stepProgress').style.width=(stage===1?0:stage===2?33+57*Math.min(o/n.ok,k/n.ko):100)+'%';$('mainBtn').textContent=!st.stream?'Activar cámara':!st.model?'Cargando modelo…':!ready()?'Calibrar piezas':'Capturar pieza';$('mainBtn').disabled=!!st.stream&&!st.model;$('autoBtn').disabled=!ready();$('autoBtn').textContent=st.auto?'■ Detener':'▶ Auto';$('addOK').disabled=$('addKO').disabled=$('backgroundBtn').disabled=!st.model||!st.stream||st.busy;$('coach').textContent=patchEnabled()?(!b?'Captura primero el fondo sin piezas.':o<3?'Registra al menos tres piezas OK desde ángulos y distancias variados.':'Banco PatchCore Lite listo; añade más muestras OK para mejorar la cobertura del producto.'):(!b?'Captura el fondo sin piezas; después añade diferentes ejemplos OK y KO.':o<n.ok||k<n.ko?'Captura el mismo producto de frente, lados, distintas distancias y con defectos localizados. Mantén fondo e iluminación controlados.':'Calibración completada. Comprueba la matriz y utiliza piezas nunca vistas para validar.');validation();historyUI();updateCalibrationCamera()}
async function modelLoad(){if(st.model||st.loading)return;st.loading=true;$('cameraState').textContent='Cargando IA · 15%';try{if(!window.tf||!window.mobilenet)throw Error('Sin acceso a las bibliotecas CDN. Comprueba la conexión y reintenta.');await tf.ready();$('cameraState').textContent='Cargando modelo · 45%';st.model=await mobilenet.load({version:2,alpha:1});$('cameraState').textContent='Optimizando · 85%';const blank=document.createElement('canvas');blank.width=blank.height=224;const t=st.model.infer(blank,true);await t.data();t.dispose();$('cameraState').textContent='● Cámara e IA listas';refresh()}catch(e){toast(e.message+' Pulsa Activar cámara para reintentar.')}finally{st.loading=false;refresh()}}
/* [MEJORA-11] Permisos HTTPS, cámara iOS y controles condicionales de capacidades. */
async function startCamera(){if(!isSecureContext){toast('Cámara bloqueada: publica la aplicación con HTTPS y vuelve a abrirla.');return}if(!navigator.mediaDevices?.getUserMedia){toast('Safari no permite cámara en este contexto. Revisa los permisos en Ajustes > Safari.');return}try{st.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:st.facing||'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:15,max:30}}});$('video').srcObject=st.stream;await $('video').play();$('empty').hidden=true;$('empty').style.display='none';st.session++;requestAnimationFrame(drawGuide);cameraControls();refresh();toast('Cámara activa. Puedes encuadrar la pieza mientras carga la IA.');modelLoad().catch(e=>toast('No se pudo cargar la IA: '+e.message)) }catch(e){toast(e.name==='NotAllowedError'?'Permiso de cámara denegado. Actívalo en Ajustes de Safari y pulsa Activar cámara.':'No se pudo iniciar la cámara: '+e.message);stopCamera()}}
function stopCamera(){stopAuto();st.stream?.getTracks().forEach(t=>t.stop());st.stream=null;$('video').srcObject=null;$('empty').hidden=false;$('empty').style.display='';$('cameraState').textContent='● Cámara inactiva';st.lastGray=null;refresh()}
async function cameraControls(){const track=st.stream?.getVideoTracks()[0],caps=track?.getCapabilities?.()||{};$('flipBtn').disabled=!track;$('torchBtn').disabled=!('torch'in caps);$('torchBtn').textContent='Linterna';$('focusBtn').disabled=!(caps.focusMode?.includes?.('manual')||caps.exposureMode?.includes?.('manual'));$('zoomBox').hidden=!(caps.zoom&&Number.isFinite(caps.zoom.min));if(!$('zoomBox').hidden){$('zoom').min=caps.zoom.min;$('zoom').max=caps.zoom.max;$('zoom').step=caps.zoom.step||.1;$('zoom').value=track.getSettings?.().zoom||caps.zoom.min}}
async function constrain(obj){const t=st.stream?.getVideoTracks()[0];if(!t)return;try{await t.applyConstraints({advanced:[obj]})}catch(e){toast('La cámara no admite este ajuste en Safari.') }}
/* [MEJORA-12] Se promedian 3 capturas y se liberan tensores tras cada inferencia. */
/* [MEJORA-32] Modo de calidad específico para fondos lisos: no exigir textura, bordes ni nitidez.
   Se usa la mediana de 3-5 fotogramas estables, tolerando hasta dos lecturas de transición. */
async function burst(mode='piece'){
 const vectors=[];let lastCanvas=null,accepted=0;
 const attempts=mode==='bg'?7:FRAMES+2,required=FRAMES;
 for(let j=0;j<attempts&&accepted<required;j++){
  const c=capture(),q=quality(c);qualityUI(q);
  const brightness=q.values.m;
  if(mode==='bg'){
   if(brightness<18||brightness>245){await new Promise(r=>setTimeout(r,130));continue}
   if(j>0&&!q.motion){await new Promise(r=>setTimeout(r,130));continue}
  }else{
   if(!q.light||!q.sharp){await new Promise(r=>setTimeout(r,130));continue}
   if(j>0&&!q.motion){await new Promise(r=>setTimeout(r,130));continue}
  }
  vectors.push(embedding(c));lastCanvas=c;accepted++;
  if(accepted<required)await new Promise(r=>setTimeout(r,125));
 }
 if(accepted<required)throw Error(mode==='bg'?'No se pudo registrar un fondo estable. Mantén el teléfono inmóvil y evita cambios bruscos de luz.':'Captura inestable o poco nítida. Mantén la pieza fija y mejora la luz.');
 return {emb:aggregate(vectors),thumb:dataURI(lastCanvas),canvas:lastCanvas};
}
async function add(cls){if(st.busy||!st.model)return;st.busy=true;refresh();try{const result=await burst(cls==='bg'?'bg':'piece'),similar=diversity(cls,result.emb);await storeRecord({id:id(),label:cls,emb:result.emb,thumb:result.thumb,at:Date.now(),synthetic:false});if(cls==='bg')st.bgTiny=tiny(result.canvas);if($('augmentation').checked&&cls!=='bg'){for(const emb of augmented(result.canvas))await storeRecord({id:id(),label:cls,emb,thumb:'',at:Date.now(),synthetic:true})}toast(similar||(cls==='bg'?'Fondo guardado. Los fondos lisos se aceptan sin exigir nitidez.':'Muestra registrada correctamente.'));flash(cls)}catch(e){toast('Captura descartada: '+e.message)}finally{st.busy=false;refresh()}}
async function inspect(auto=false,pre=null){if(st.busy||!ready())return;st.busy=true;try{const result=pre||await burst(),prediction=predictionFor(result.emb),sim=Number($('minSimilarity').value),margin=Number($('minMargin').value);
 clearDefectMarkers();
 if(referenceEnabled()&&$('localDetails')?.checked&&window.VQCVision){
  const detail=await window.VQCVision.analyze(result.canvas,st.records,{sensitivity:$('detailSensitivity').value,maxDifference:$('viewTolerance').value});
  if(detail.state==='uncertain'){clearDefectMarkers();prediction.label='uncertain';prediction.reason=detail.reason}
  else if(detail.state==='suspect'){drawDefectMarkers(detail);prediction.label='ko';prediction.reason='Anomalía localizada en la superficie';prediction.score=Math.min(prediction.score,.8)}
  else if(detail.state==='compatible'&&prediction.label==='ko'){clearDefectMarkers();prediction.label='uncertain';prediction.reason='La comparación local no confirma el defecto'}
 }else{clearDefectMarkers()}const safe=(referenceEnabled()||patchEnabled())?prediction.label!=='uncertain':prediction.label!=='bg'&&prediction.score>=sim&&prediction.margin>=margin&&prediction.vote>=.12;const label=safe?prediction.label:'uncertain';newResult(label,prediction.score,(referenceEnabled()||patchEnabled())?'Anomalía '+(prediction.anomaly??0).toFixed(3)+' · Umbral '+(prediction.threshold??0).toFixed(3):'');flash(label);if(label==='uncertain'){st.pending=result;$('correctionCard').hidden=false;$('presenceState').textContent='Requiere confirmación'}else{$('correctionCard').hidden=true;$('presenceState').textContent=auto?'Pieza inspeccionada':'Inspección manual'}if(!auto){bump(label);await storeHistory({id:id(),at:Date.now(),label,score:prediction.score,batch:$('batch').value,operator:$('operator').value,thumb:result.thumb,error:label==='uncertain'})}else{st.pendingAuto={...result,label,score:prediction.score}}}catch(e){toast(e.message)}finally{st.busy=false;refresh()}}
async function autoTick(){if(!st.auto||st.busy||st.autoBusy||!ready())return;st.autoBusy=true;try{const c=capture(),q=quality(c);qualityUI(q);if(q.values.m<18||q.values.m>245||!q.motion){$('presenceState').textContent='Esperando luz estable';return}/* [MEJORA-36] Prefiltro 32×32 evita inferencia CNN sobre banda vacía. */
const fastEmpty=st.bgTiny&&pixDiff(tiny(c),st.bgTiny)<6;
const emb=fastEmpty?null:embedding(c);const bg=fastEmpty?1:presence(emb),isEmpty=bg!==null&&bg>=Math.max(.90,Number($('minSimilarity').value))&&q.motion;st.emptyRun=isEmpty?st.emptyRun+1:0;st.presentRun=!isEmpty&&q.motion?st.presentRun+1:0;if(isEmpty){$('presenceState').textContent='Fondo vacío';if(st.emptyRun>=MIN_EMPTY){hideOperatorVerdict();if(st.pieceRecorded&&st.pendingAuto){const h=st.pendingAuto;bump(h.label);await storeHistory({id:id(),at:Date.now(),label:h.label,score:h.score,batch:$('batch').value,operator:$('operator').value,thumb:h.thumb,error:h.label==='uncertain'})}st.pieceRecorded=false;st.pendingAuto=null;st.pending=null;$('correctionCard').hidden=true}}else{$('presenceState').textContent=q.motion?'Pieza detectada':'Esperando estabilidad';if(st.presentRun>=MIN_STABLE&&!st.pieceRecorded){st.pieceRecorded=true;await inspect(true)}}}catch(e){toast('Escaneo interrumpido: '+e.message);stopAuto()}finally{st.autoBusy=false;refresh()}}
function stopAuto(){st.auto=false;clearInterval(st.loop);st.loop=null;st.presentRun=st.emptyRun=0;refresh()}
function startAuto(){if(st.auto){stopAuto();return}if(!ready()){toast('Completa las metas OK/KO y captura un fondo vacío primero.');return}st.auto=true;st.pieceRecorded=false;st.pendingAuto=null;st.emptyRun=st.presentRun=0;st.lastGray=null;st.loop=setInterval(autoTick,Number($('scanSpeed').value));refresh()}
/* [MEJORA-13] Aprendizaje activo y correcciones persistidas. */
async function correct(label){if(!st.pending)return;const p=st.pending;await storeRecord({id:id(),label,emb:p.emb,thumb:p.thumb,at:Date.now(),synthetic:false});await storeHistory({id:id(),at:Date.now(),label,score:0,batch:$('batch').value,operator:$('operator').value,thumb:p.thumb,error:true,corrected:true});st.pending=null;$('correctionCard').hidden=true;toast('Corrección añadida al entrenamiento.');refresh()}
function historyUI(){const f=$('historyFilter').value;const records=st.history.filter(x=>f==='all'||f==='error'&&x.error||x.label===f);$('history').replaceChildren();for(const h of records.slice(0,100)){const row=document.createElement('div');row.className='item';if(h.thumb){const img=new Image();img.src=h.thumb;img.alt='Muestra';row.append(img)}const desc=document.createElement('div');desc.className='details';const date=new Date(h.at).toLocaleString('es-ES');desc.textContent=date;const sm=document.createElement('small');sm.textContent=(h.corrected?'Corrección · ':'')+`Lote ${h.batch||'—'} · Similitud ${h.score?(h.score*100).toFixed(1)+'%':'—'}`;desc.append(sm);const tag=document.createElement('b');tag.className='tag '+(h.label==='uncertain'?'uncertain':h.label==='ko'?'ko':'');tag.textContent=h.label==='uncertain'?'INCIERTO':h.label.toUpperCase();row.append(desc,tag);$('history').append(row)}$('countAll').textContent=st.count;$('countBad').textContent=st.koCount;$('rate').textContent=st.count?(st.koCount/st.count*100).toFixed(1)+'%':'0%'}
function csv(){const lines=[['fecha','resultado','similitud','lote','operario','error']];for(const r of st.history)lines.push([new Date(r.at).toISOString(),r.label,r.score||'',r.batch||'',r.operator||'',r.error?'sí':'no']);download('\ufeff'+lines.map(line=>line.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';')).join('\r\n'),'visionqc-historial.csv','text/csv;charset=utf-8')}
/* [MEJORA-14] Exportación e importación con validación de esquema. */
function exportData(){download(JSON.stringify({version:3,date:new Date().toISOString(),records:st.records,targets:needs()},null,2),'visionqc-calibracion.json','application/json')}
async function importData(file){try{const obj=JSON.parse(await file.text());if(obj.version!==3||!Array.isArray(obj.records)||obj.records.length>1500)throw Error('Formato de calibración inválido.');for(const r of obj.records){if(!['ok','ko','bg'].includes(r.label)||!Array.isArray(r.emb)||r.emb.length!==PARTS||!r.emb.every(p=>Array.isArray(p)&&p.length>0&&p.every(Number.isFinite)))throw Error('Vectores inválidos.')}for(const r of obj.records){r.id=id();await storeRecord(r)}if(obj.targets){$('targetOK').value=limit(obj.targets.ok);$('targetKO').value=limit(obj.targets.ko)}toast('Calibración importada.');refresh()}catch(e){toast('Error al importar: '+e.message)}}

/* [MEJORA-22] Cuatro espacios de trabajo sin recrear video o modelo al cambiar de sección. */
let currentTab='visor';
function buildTabs(){
 const header=document.querySelector('header.top');
 const parent=header.parentElement;
 const panes={};
 for(const name of ['visor','calibration','production','camera']){
  const pane=document.createElement('section');pane.id='tab-'+name;pane.className='tab-pane';pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby','tab-button-'+name);pane.hidden=name!=='visor';
  parent.insertBefore(pane,$('inspectionActions'));panes[name]=pane;
 }
 const viewer=$('viewer'),quality=document.querySelector('.quality');
 panes.visor.append(document.querySelector('.step'),document.querySelector('.progress'),viewer,quality,$('correctionCard'));
 const heading=document.createElement('div');heading.className='tab-caption';heading.innerHTML='<h1>Entrenamiento guiado</h1><p>Enfoca, registra el fondo y añade muestras OK y KO. La cámara permanece activa.</p>';
 panes.calibration.append(heading,$('training'));
 panes.production.append($('productionCard'),$('historyCard'));
 panes.camera.append($('cameraCard'));
 const speed=$('scanSpeed').closest('.field');panes.camera.append(speed);
 const fs=$('fullscreenBtn');fs.parentElement.removeChild(fs);panes.visor.insertBefore(fs,panes.visor.querySelector('.step'));
 const history=$('historyDetails');history.open=true;
 $('cameraCard').querySelector('details').open=true;
 const calibrationHint=document.createElement('p');calibrationHint.className='muted';calibrationHint.id='trainingInstruction';calibrationHint.textContent='1. Activa la cámara · 2. Captura el fondo vacío · 3. Registra muestras correctas y defectuosas.';
 panes.calibration.insertBefore(calibrationHint,$('training'));
 const cameraStart=document.createElement('button');cameraStart.id='calibrationCameraBtn';cameraStart.type='button';cameraStart.className='button primary calibrateStart';cameraStart.textContent='Activar cámara';
 cameraStart.addEventListener('click',async()=>{if(!st.stream){await startCamera()}else{const v=$('video');try{v.srcObject=st.stream;await v.play();$('empty').hidden=true;$('empty').style.display='none';requestAnimationFrame(drawGuide);if(!st.model)await modelLoad();toast('Vista previa reanudada.')}catch(e){toast('No se pudo reanudar la cámara: '+e.message)}}updateCalibrationCamera()});
 panes.calibration.insertBefore(cameraStart,$('training'));
 const calibrationCaptures=document.createElement('div');calibrationCaptures.id='calibrationCaptures';calibrationCaptures.className='calibrationCaptures';
 panes.calibration.insertBefore(calibrationCaptures,$('training'));
 calibrationCaptures.append($('backgroundBtn'),$('addOK'),$('addKO'));
 document.querySelectorAll('#tabNav [role=tab]').forEach(button=>button.addEventListener('click',()=>selectTab(button.dataset.tab)));
 selectTab('visor');
}
/* [MEJORA-24] Control explícito de cámara en Calibración; no exige navegación previa. */
function updateCalibrationCamera(){
 const b=$('calibrationCameraBtn');if(!b)return;
 b.textContent=!st.stream?'◎ Activar cámara':$('video').paused?'▶ Reanudar cámara':'↻ Reanudar cámara';
 b.disabled=false;
 $('viewerBadge').textContent=!st.stream?'◎ Toca Activar cámara':!st.model?'◌ Preparando IA':'● Cámara en directo';
 $('viewerBadge').classList.toggle('live',!!st.stream);
 if(currentTab==='calibration'){
 $('trainingInstruction').textContent=!st.stream?'Activa la cámara aquí. Después registra el fondo sin pieza.':!st.model?'El modelo está cargando. Mantén esta pantalla abierta.':count('bg')===0?'1 / 3 · Retira las piezas y registra el fondo vacío.':!trained()?'2 / 3 · Centra cada pieza y guarda muestras OK y KO variadas.':'3 / 3 · Calibración lista. Abre Visor para inspeccionar.';
 }
}
/* [MEJORA-23] El visor físico se reutiliza entre inspección y calibración. */
function selectTab(name){
 if(!['visor','calibration','production','camera'].includes(name))return;
 if(name!=='visor'&&st.auto)stopAuto();
 currentTab=name;document.body.dataset.tab=name;st.lastGray=null;
 const pane=$('tab-'+name);
 if(name==='visor'||name==='calibration'){
  const host=name==='visor'?pane:$('training');
  const viewer=$('viewer'),quality=document.querySelector('.quality');
  if(name==='calibration'){const anchor=$('trainingInstruction');anchor.after(viewer);viewer.after(quality)}
  else{const step=pane.querySelector('.progress');step.after(viewer);viewer.after(quality)}
 }
 for(const tab of ['visor','calibration','production','camera']){
  $('tab-'+tab).hidden=tab!==name;
  $('tab-button-'+tab).setAttribute('aria-selected',String(tab===name));
 }
 $('inspectionActions').hidden=name!=='visor';
 updateCalibrationCamera();
 window.scrollTo({top:0,behavior:'auto'});
 // [MEJORA-28] Safari iOS puede pausar el video cuando se mueve un elemento entre contenedores.
 // Reasociamos el MediaStream después de mostrar el destino, y reanudamos explícitamente.
 if(name==='visor'||name==='calibration'){
  requestAnimationFrame(async()=>{
   const v=$('video');
   if(st.stream){
    try{
     if(v.srcObject!==st.stream)v.srcObject=st.stream;
     v.muted=true;v.playsInline=true;v.setAttribute('playsinline','');
     await v.play();$('empty').hidden=true;
     $('viewerBadge').textContent='● Cámara en directo';
    }catch(err){
     $('viewerBadge').textContent='⚠ Vista previa detenida';
     toast('Safari pausó la vista previa. Toca Reanudar cámara.');
    }
   }
   drawGuide();
  });
 }else requestAnimationFrame(drawGuide);
}

function on(id,ev,fn){$(id).addEventListener(ev,fn)}
on('patchcoreMode','change',()=>{localStorage.setItem('vqc_patchcore_mode',$('patchcoreMode').checked?'1':'0');stopAuto();st.pending=null;newResult(null);refresh();toast(patchEnabled()?'PatchCore Lite activado. Inspecciona con muestras OK de referencia.':'Modo KNN activado.')});
on('patchSensitivity','change',()=>{localStorage.setItem('vqc_patch_sensitivity',$('patchSensitivity').value);stopAuto();refresh()});
$('patchcoreMode').checked=localStorage.getItem('vqc_patchcore_mode')==='1';
$('patchSensitivity').value=localStorage.getItem('vqc_patch_sensitivity')||'1';
on('mainBtn','click',async()=>{if(!st.stream){await startCamera();return}if(!st.model){await modelLoad();return}if(!ready()){selectTab('calibration');toast(patchEnabled()?'PatchCore Lite necesita fondo y tres muestras OK como mínimo.':'Completa las metas OK y KO.');return}await inspect(false)});
on('autoBtn','click',startAuto);on('backgroundBtn','click',()=>add('bg'));on('addOK','click',()=>add('ok'));on('addKO','click',()=>add('ko'));on('correctOK','click',()=>correct('ok'));on('correctKO','click',()=>correct('ko'));
on('targetOK','change',()=>{localStorage.setItem('vqc_ok',limit($('targetOK').value));refresh()});on('targetKO','change',()=>{localStorage.setItem('vqc_ko',limit($('targetKO').value));refresh()});
on('autoThreshold','change',()=>{const manual=!$('autoThreshold').checked;$('minSimilarity').disabled=$('minMargin').disabled=!manual;refresh()});on('historyFilter','change',historyUI);on('csvBtn','click',csv);on('exportBtn','click',exportData);on('importBtn','click',()=>$('fileImport').click());on('fileImport','change',e=>{if(e.target.files[0])importData(e.target.files[0]);e.target.value=''});
on('clearBtn','click',async()=>{if(!confirm('¿Eliminar toda la calibración guardada?'))return;stopAuto();await transaction(STORE,'readwrite',o=>o.clear());st.records=[];st.bgTiny=null;st.validationKey='';st.pending=null;st.pendingAuto=null;refresh();newResult(null);toast('Calibración eliminada. Los contadores del turno se conservan en Supervisor → Turno. Puedes cerrarlo para reiniciarlos.')});
on('soundBtn','click',()=>{st.silent=!st.silent;$('soundBtn').textContent=st.silent?'♫':'♪';toast(st.silent?'Sonidos desactivados.':'Sonidos activados. El audio requiere interacción con la pantalla.')});on('themeBtn','click',()=>{const light=document.documentElement.dataset.theme!=='light';document.documentElement.dataset.theme=light?'light':'dark';$('themeColor').content=light?'#f6f7fa':'#10141b'});
on('flipBtn','click',async()=>{st.facing=st.facing==='user'?'environment':'user';stopCamera();await startCamera()});on('torchBtn','click',async()=>{st.torch=!st.torch;await constrain({torch:st.torch})});on('focusBtn','click',()=>constrain({focusMode:'manual',exposureMode:'manual'}));on('zoom','input',e=>constrain({zoom:Number(e.target.value)}));
on('fullscreenBtn','click',()=>{const on=$('viewer').classList.toggle('full');$('fullscreenBtn').textContent=on?'Salir de pantalla completa':'Expandir visor';drawGuide()});on('fullExit','click',()=>{$('viewer').classList.remove('full');drawGuide()});on('scanSpeed','change',()=>{if(st.auto){stopAuto();startAuto()}});
new ResizeObserver(drawGuide).observe($('viewer'));document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAuto()});window.addEventListener('pagehide',stopCamera);initOperatorUI();restore();refresh();

/* Interfaz Operario/Supervisor separada de los cálculos de visión. */
let uiMode='manual',uiPinIntent='unlock',uiPane='cal';
function u(id){return document.getElementById(id)}
function hideOperatorVerdict(){clearDefectMarkers();const p=u('verdictPanel');p.classList.remove('visible','ko','uncertain');p.hidden=true}
/* Map detection cells from normalized product coordinates to the actual viewer ROI.
   Indicators show suspicious image regions, not verified defect boundaries. */
function clearDefectMarkers(){const layer=document.getElementById('defectMarkers');if(layer)layer.replaceChildren()}
function drawDefectMarkers(detail){
 const viewer=document.getElementById('viewer');if(!viewer||!detail?.box||!detail.regions?.length)return;
 let layer=document.getElementById('defectMarkers');
 if(!layer){layer=document.createElement('div');layer.id='defectMarkers';layer.setAttribute('aria-label','Regiones con posibles defectos');viewer.append(layer)}
 layer.replaceChildren();
 const g=geometry(),box=detail.box,cell=16,sourceSize=192;
 for(const region of detail.regions.slice(0,3)){
  const x=(box.x+(region.x+.5)*cell*box.side/sourceSize)/sourceSize;
  const y=(box.y+(region.y+.5)*cell*box.side/sourceSize)/sourceSize;
  const marker=document.createElement('div');marker.className='defectMarker';
  marker.style.left=(g.r.x+g.r.w*x)+'px';marker.style.top=(g.r.y+g.r.h*y)+'px';
  marker.textContent='!';marker.setAttribute('aria-label','Posible defecto');
  layer.append(marker);
 }
}
function presentOperatorVerdict(label,score){
 const p=u('verdictPanel');if(!label){hideOperatorVerdict();return}
 p.hidden=false;p.className='visible'+(label==='ko'?' ko':label==='uncertain'?' uncertain':'');
 u('vIcon').textContent=label==='ok'?'✓':label==='ko'?'✕':'?';
 u('vText').textContent=label==='ok'?'CORRECTA':label==='ko'?'DEFECTUOSA':'NO RECONOCIDA';
 u('vScore').textContent=score===null?'Sin puntuación suficiente':'Similitud estimada · '+Math.round(Math.max(0,Math.min(1,score))*100)+'%';
 u('fixButtons').hidden=label!=='uncertain';u('gameHint').hidden=label!=='uncertain';
 u('operStatus').textContent=label==='uncertain'?'Confirma el resultado':st.auto?'Quita la pieza':'Retira la pieza';
 if(navigator.vibrate)navigator.vibrate(label==='ko'?[80,60,80]:[40]);
}
function updateOperator(){
 u('lotName').textContent=u('batch').value||'Sin lote';
 u('shiftNumbers').textContent=count('ok')===0&&count('ko')===0&&count('bg')===0?'Sin calibrar':st.count+' · '+st.koCount+' KO';
 u('operPrimary').textContent=!st.stream?'Activar cámara':!ready()?'Confirmar calibración':st.auto?'Detener inspección':uiMode==='automatic'?'Iniciar automático':'Inspeccionar pieza';
 u('operMissing').hidden=!st.stream||ready();if(st.stream&&!ready())u('operStatus').textContent=calibrationComplete()?'Confirma el entrenamiento en Supervisor':'Calibración pendiente';
 u('modoManual').setAttribute('aria-pressed',String(uiMode==='manual'));
 u('modoAuto').setAttribute('aria-pressed',String(uiMode==='automatic'));
 if(!u('superScreen').hidden)updateCalibrationWizard();
}
const originalRefresh=refresh;
refresh=function(){originalRefresh();updateOperator()};
async function pinHash(pin,salt){const data=new TextEncoder().encode(salt+':'+pin),hash=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}
function savedPin(){try{return JSON.parse(localStorage.getItem('vqc_super_pin'))}catch(e){return null}}
function requestSupervisor(){u('pinOverlay').hidden=true;showSupervisor('cal')}
async function verifyPin(){const pin=u('pinInput').value;if(!/^\d{4}$/.test(pin)){u('pinMessage').textContent='Se requieren cuatro números.';return}const saved=savedPin();
 if(!saved||uiPinIntent==='change'){const salt=crypto.randomUUID?.()||String(Date.now());localStorage.setItem('vqc_super_pin',JSON.stringify({salt,hash:await pinHash(pin,salt)}));u('pinOverlay').hidden=true;if(uiPinIntent==='unlock')showSupervisor('cal');return}
 if(await pinHash(pin,saved.salt)===saved.hash){u('pinOverlay').hidden=true;showSupervisor('cal')}else u('pinMessage').textContent='PIN incorrecto.';
}
/* Contexto visible al compartir la cámara entre entrenamiento y producción. */
function setCameraContext(training){
 const viewer=u('viewer');if(!viewer)return;
 viewer.dataset.context=training?'training':'inspection';
 let tag=u('cameraContextTag');
 if(!tag){tag=document.createElement('div');tag.id='cameraContextTag';tag.setAttribute('aria-live','polite');viewer.append(tag)}
 tag.textContent=training?'◎ ENTRENAMIENTO':'● INSPECCIÓN';
 let detail=u('cameraContextDetail');
 if(!detail){detail=document.createElement('div');detail.id='cameraContextDetail';viewer.append(detail)}
 if(!training)detail.textContent='';
 else detail.textContent='Centra la pieza dentro de las esquinas';
}
function repositionViewer(target){setCameraContext(target.id==='calViewer');target.append(u('viewer'));requestAnimationFrame(async()=>{if(st.stream){try{const v=u('video');if(v.srcObject!==st.stream)v.srcObject=st.stream;await v.play();u('empty').hidden=true}catch(e){u('operStatus').textContent='Pulsa activar cámara para reanudar'}}drawGuide()})}
function showSupervisor(pane){stopAuto();u('operScreen').hidden=true;u('superScreen').hidden=false;u('accessMenu').hidden=true;setSupervisorPane(pane)}
function leaveSupervisor(){u('superScreen').hidden=true;u('operScreen').hidden=false;repositionViewer(u('operVideo'));updateOperator()}
function setSupervisorPane(pane){uiPane=pane;for(const [key,id] of [['cal','calPane'],['turn','turnPane'],['settings','settingsPane']])u(id).hidden=key!==pane;document.querySelectorAll('[data-pane]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.pane===pane)));if(pane==='cal')repositionViewer(u('calViewer'));updateCalibrationWizard()}
function updateCalibrationWizard(){
 if(uiPane!=='cal')return;const bg=count('bg'),ok=count('ok'),ko=count('ko'),n=needs(),minOK=referenceEnabled()?1:n.ok,stage=!bg?0:ok<minOK?1:ko<n.ko&&!patchEnabled()&&!referenceEnabled()?2:3;
 [...u('calSteps').children].forEach((x,i)=>x.classList.toggle('active',i===Math.min(stage,2)));
 u('calCount').textContent=stage===0?'1 · Registrar fondo':stage===1?'2 · Buenas: '+ok+' de '+minOK:stage===2?'3 · Defectuosas: '+ko+' de '+n.ko:approvalValid()?'✓ Entrenamiento confirmado':'✓ Muestras completas · Confirma para producir';
 if(u('cameraContextDetail')&&uiPane==='cal')u('cameraContextDetail').textContent=stage===0?'ENTRENAR · Fondo vacío':stage===1?'ENTRENAR · Guardar pieza buena':stage===2?'ENTRENAR · Guardar pieza defectuosa':'Calibración completada';
 u('calHelp').textContent=stage===0?'Retira las piezas.':stage===1?(referenceEnabled()?'Fotografía el producto correcto. Añade más referencias desde otros ángulos cuando quieras.':'Coloca una pieza buena desde distintos ángulos.'):stage===2?'Coloca una pieza defectuosa.':'Puedes empezar a inspeccionar.';
 u('calFill').style.width=(stage===0?0:stage===1?10+45*ok/(referenceEnabled()?1:n.ok):stage===2?55+45*ko/n.ko:100)+'%';
 u('calCapture').textContent=!st.stream?'Activar cámara':!st.model?'Cargando IA…':stage===3?'Confirmar entrenamiento e iniciar producción':'Capturar muestra';
 u('calDone').hidden=stage!==3;u('calDone').textContent=approvalValid()?'Ir al visor':'Confirmar e iniciar producción';
}
async function captureCal(){if(!st.stream){await startCamera();return}if(!st.model){await modelLoad();return}const n=needs(),minOK=referenceEnabled()?1:n.ok,label=!count('bg')?'bg':count('ok')<minOK?'ok':count('ko')<n.ko&&!patchEnabled()&&!referenceEnabled()?'ko':null;if(!label){approveTraining();return}u('calCapture').disabled=true;try{await add(label)}finally{u('calCapture').disabled=false;updateCalibrationWizard()}}
async function undoCal(){const list=st.records.filter(r=>!r.synthetic);const last=list[list.length-1];if(!last)return;await transaction(STORE,'readwrite',o=>o.delete(last.id));st.records=st.records.filter(r=>r.id!==last.id);st.validationKey='';if(last.label==='bg')st.bgTiny=null;refresh()}
function closeTurn(){if(!confirm('¿Cerrar turno y reiniciar contadores?'))return;const shifts=JSON.parse(localStorage.getItem('vqc_turns')||'[]');shifts.push({at:new Date().toISOString(),...loadCounts(),batch:u('batch').value});localStorage.setItem('vqc_turns',JSON.stringify(shifts));localStorage.setItem(COUNTS_KEY,JSON.stringify({n:0,ko:0}));st.count=st.koCount=0;refresh()}
/* Dataset de ejemplo: entrenar solo partición train, evaluar test sin fuga de datos. */
async function importDemoDataset(file){
 if(!st.model){toast('Activa la cámara y espera la carga del modelo antes de importar el ejemplo.');return}
 if(st.busy)return;st.busy=true;
 const status=u('demoImportStatus');let trained=0,testing=[];
 try{
  const data=JSON.parse(await file.text());
  if(data.format!=='visionqc-demo-dataset'||data.version!==1||!Array.isArray(data.images)||data.images.length>150)throw Error('Formato de dataset incorrecto.');
  const entries=data.images;
  if(!entries.every(x=>['ok','ko'].includes(x.label)&&['train','test'].includes(x.split)&&typeof x.image==='string'&&x.image.startsWith('data:image/jpeg;base64,')))throw Error('Imágenes o etiquetas inválidas.');
  const hashes=new Set();
  const samples=[];
  for(const x of entries){
   if(hashes.has(x.hash))continue;hashes.add(x.hash);
   const img=new Image();img.src=x.image;await img.decode();
   const canvas=document.createElement('canvas');canvas.width=canvas.height=448;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#d8d8d8';ctx.fillRect(0,0,448,448);
   const scale=Math.min(448/img.width,448/img.height);const w=img.width*scale,h=img.height*scale;
   ctx.drawImage(img,(448-w)/2,(448-h)/2,w,h);
   const emb=embedding(canvas);samples.push({x,emb});
   status.textContent='Procesando imagen '+samples.length+' / '+entries.length;
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(!samples.some(p=>p.x.split==='train'&&p.x.label==='ok')||!samples.some(p=>p.x.split==='train'&&p.x.label==='ko'))throw Error('Necesita imágenes OK y KO de entrenamiento.');
  // Evaluar contra esta importación exclusivamente, sin contaminación de calibraciones previas.
  const training=samples.filter(p=>p.x.split==='train').map(p=>({id:p.x.hash,label:p.x.label,emb:p.emb}));
  testing=samples.filter(p=>p.x.split==='test');
  let correct=0;let matrix={tp:0,fp:0,fn:0,tn:0};
  for(const t of testing){
   const prediction=classify(t.emb,training);const label=prediction.label;
   if(label===t.x.label)correct++;
   if(t.x.label==='ko'&&label==='ko')matrix.tp++;
   else if(t.x.label==='ok'&&label==='ko')matrix.fp++;
   else if(t.x.label==='ko')matrix.fn++;else matrix.tn++;
  }
  for(const p of samples.filter(p=>p.x.split==='train')){
   await storeRecord({id:id(),label:p.x.label,emb:p.emb,thumb:p.x.image,at:Date.now(),synthetic:false,demo:true});
   trained++;
  }
  localStorage.setItem('vqc_demo_mode','1');
  status.textContent='Ejemplo importado: '+trained+' entrenamiento, '+testing.length+' prueba. Aciertos en prueba: '+correct+'/'+testing.length+'. TP '+matrix.tp+', FP '+matrix.fp+', FN '+matrix.fn+', TN '+matrix.tn+'. Sin validación industrial.';
  toast('Dataset cargado. Para inspección en vivo registra un fondo vacío y confirma la calibración.');
 }catch(e){status.textContent='No se pudo importar: '+e.message}
 finally{st.busy=false;refresh()}
}
function initOperatorUI(){
 // El veredicto debe vivir dentro del visor y empezar oculto.
 u('operVideo').append(u('verdictPanel'));hideOperatorVerdict();
 const actionHint=document.createElement('div');actionHint.id='gameHint';actionHint.hidden=true;actionHint.textContent='CONFIRMA LA PIEZA';u('verdictPanel').append(actionHint);
 // Mantenemos los controles de ML originales y montamos el mismo vídeo en ambas pantallas.
 u('turnPane').append(u('productionCard'),u('historyCard'));
 u('settingsContent')?.append();
 u('settingsPane').append(u('cameraCard'));
 const advanced=document.createElement('details');advanced.className='card';advanced.innerHTML='<summary>Avanzado</summary>';
 for(const id of ['autoThreshold','minSimilarity','minMargin','validation']){const el=u(id);if(el)advanced.append(el.closest('.field')||el)}
 u('settingsPane').append(advanced,u('soundBtn'),u('themeBtn'),u('flipBtn'));
 // Controles de entrenamiento dentro de Ajustes, no ocultos.
 const trainSettings=document.createElement('div');trainSettings.className='card';trainSettings.id='trainingSettings';
 const heading=document.createElement('h2');heading.textContent='Entrenamiento';trainSettings.append(heading);
 for(const id of ['targetOK','targetKO','augmentation']){const el=u(id);trainSettings.append(el.closest('.field'))}
 const help=document.createElement('p');help.className='muted';help.textContent='Define las imágenes necesarias por clase. Usa distintos ángulos, acercamientos y defectos.';trainSettings.append(help);
 u('settingsContent').prepend(trainSettings);
 const demoCard=document.createElement('div');demoCard.className='card';
 demoCard.innerHTML='<h2>Dataset de demostración</h2><p class="muted">Importa el archivo JSON de EXEMPLOS. Las imágenes de evaluación nunca se usan para entrenar. No sustituye la captura de fondo para usar la cámara.</p><input id="demoFile" type="file" accept=".json,application/json" aria-label="Seleccionar dataset de ejemplo"><p id="demoImportStatus" class="muted" role="status">Sin dataset de ejemplo importado</p>';
 u('settingsContent').prepend(demoCard);
 u('demoFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(file)await importDemoDataset(file);e.target.value=''});
 const referenceBox=document.createElement('div');referenceBox.className='card';
 referenceBox.innerHTML='<h2>Referencia OK · Sin dataset KO</h2><p class="muted">Utiliza una imagen buena como referencia inicial y detecta diferencias locales. Para más fiabilidad, registra varios ángulos. Los resultados con una sola foto son experimentales.</p><div class="field"><label for="referenceMode">Activar referencia OK</label><input type="checkbox" id="referenceMode"></div><div class="field"><label for="referenceSensitivity">Sensibilidad</label><select id="referenceSensitivity"><option value="0.85">Alta</option><option value="1">Equilibrada</option><option value="1.25">Conservadora</option></select></div><p class="muted">El fondo vacío sigue siendo necesario. No requiere ejemplos KO.</p>';
 u('settingsContent').prepend(referenceBox);
 const details=document.createElement('div');details.className='card';
 details.innerHTML='<h2>Detalles pequeños y fondo</h2><p class="muted">Separa la pieza del fondo y revisa 144 regiones. Aprende la variación normal con varias fotos correctas. Las diferencias dudosas se envían a revisión.</p><div class="field"><label for="localDetails">Análisis de detalles</label><input id="localDetails" type="checkbox" checked></div><div class="field"><label for="detailSensitivity">Rigor de comparación</label><select id="detailSensitivity"><option value="0.8">Alto</option><option value="1" selected>Normal</option><option value="1.25">Conservador</option></select></div><div class="field"><label for="viewTolerance">Variación de posición</label><select id="viewTolerance"><option value="22">Baja</option><option value="30" selected>Normal</option><option value="40">Alta</option></select></div><p class="muted">Funciona en Referencia OK. Usa al menos 3 vistas OK para estimar el umbral y 10–30 para cubrir más ángulos.</p>';
 u('settingsContent').prepend(details);
 u('localDetails').checked=localStorage.getItem('vqc_local_details')!=='0';
 u('detailSensitivity').value=localStorage.getItem('vqc_detail_sensitivity')||'1';
 u('viewTolerance').value=localStorage.getItem('vqc_view_tolerance')||'30';
 u('viewTolerance').addEventListener('change',()=>localStorage.setItem('vqc_view_tolerance',u('viewTolerance').value));
 u('localDetails').addEventListener('change',()=>localStorage.setItem('vqc_local_details',u('localDetails').checked?'1':'0'));
 u('detailSensitivity').addEventListener('change',()=>localStorage.setItem('vqc_detail_sensitivity',u('detailSensitivity').value));
 u('referenceMode').checked=localStorage.getItem('vqc_reference_mode')==='1';
 u('referenceSensitivity').value=localStorage.getItem('vqc_reference_sensitivity')||'1';
 u('referenceMode').addEventListener('change',()=>{if(u('referenceMode').checked){u('patchcoreMode').checked=false;localStorage.setItem('vqc_patchcore_mode','0')}localStorage.setItem('vqc_reference_mode',u('referenceMode').checked?'1':'0');stopAuto();hideOperatorVerdict();refresh()});
 u('referenceSensitivity').addEventListener('change',()=>{localStorage.setItem('vqc_reference_sensitivity',u('referenceSensitivity').value);stopAuto();refresh()});
 u('patchcoreMode').addEventListener('change',()=>{if(u('patchcoreMode').checked){u('referenceMode').checked=false;localStorage.setItem('vqc_reference_mode','0')}refresh()});
 const preferences=document.createElement('div');preferences.className='card';preferences.innerHTML='<h2>Preferencias</h2>';
 preferences.append(u('soundBtn'),u('themeBtn'),u('flipBtn'));
 u('settingsContent').append(preferences);
 const detection=document.createElement('div');detection.className='card';detection.innerHTML='<h2>Detección</h2>';
 for(const id of ['patchcoreMode','patchSensitivity']){const el=u(id);if(el)detection.append(el.closest('.field'))}
 u('settingsContent').append(detection,advanced);
 const data=document.createElement('div');data.className='card';data.innerHTML='<h2>Datos de calibración</h2>';
 for(const id of ['exportBtn','importBtn','fileImport','clearBtn'])data.append(u(id));
 u('settingsContent').append(data);
 u('training').hidden=true;
 u('operMenu').onclick=()=>u('accessMenu').hidden=!u('accessMenu').hidden;
 u('accessSupervisor').onclick=requestSupervisor;
 u('goSuper').onclick=requestSupervisor;
 u('pinBack').onclick=()=>u('pinOverlay').hidden=true;
 u('pinOK').onclick=verifyPin;u('pinInput').onkeydown=e=>{if(e.key==='Enter')verifyPin()};
 u('exitSuper').onclick=leaveSupervisor;
 document.querySelectorAll('[data-pane]').forEach(b=>b.onclick=()=>setSupervisorPane(b.dataset.pane));
 u('modoManual').onclick=()=>{uiMode='manual';if(st.auto)stopAuto();updateOperator()};
 u('modoAuto').onclick=()=>{uiMode='automatic';updateOperator()};
 u('operPrimary').onclick=async()=>{if(!st.stream){await startCamera();return}if(!ready()){requestSupervisor();return}if(st.auto){stopAuto();hideOperatorVerdict();return}if(uiMode==='automatic'){startAuto();return}u('operStatus').textContent='Analizando…';u('operPrimary').disabled=true;try{await inspect(false)}finally{u('operPrimary').disabled=false;updateOperator()}};
 u('calCapture').onclick=captureCal;u('calUndo').onclick=undoCal;u('calDone').onclick=approveTraining;
 u('fixGood').onclick=()=>{u('fixGood').classList.add('chosen');u('correctOK').click();u('operStatus').textContent='✓ Corrección registrada';hideOperatorVerdict()};
 u('fixBad').onclick=()=>{u('fixBad').classList.add('chosen');u('correctKO').click();u('operStatus').textContent='✓ Corrección registrada';hideOperatorVerdict()};
 u('closeTurn').onclick=closeTurn;
 // PIN eliminado: no acceder a un botón que ya no existe.
 u('batch').oninput=updateOperator;
 repositionViewer(u('operVideo'));
}

})();
