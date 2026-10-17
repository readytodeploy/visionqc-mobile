/* VisionQC v2: segmentación conservadora de producto y comparación local multirregión.
   No es segmentación semántica ni detección certificada de microdefectos. */
(function(){
'use strict';
const S=192, cache=new Map();
function gray(canvas){const c=document.createElement('canvas');c.width=c.height=S;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,S,S);const rgba=ctx.getImageData(0,0,S,S).data;const out=new Float32Array(S*S);for(let i=0;i<out.length;i++)out[i]=.299*rgba[i*4]+.587*rgba[i*4+1]+.114*rgba[i*4+2];return out}
function fromUrl(src){if(cache.has(src))return cache.get(src);const p=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=c.height=S;c.getContext('2d').drawImage(img,0,0,S,S);resolve(gray(c))};img.onerror=reject;img.src=src});cache.set(src,p);if(cache.size>55)cache.delete(cache.keys().next().value);return p}
function bounds(a,b){let x0=S,y0=S,x1=-1,y1=-1,changed=0;for(let y=2;y<S-2;y++)for(let x=2;x<S-2;x++){const i=y*S+x;if(Math.abs(a[i]-b[i])>20){changed++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
 const occupancy=changed/(S*S);if(occupancy<.025||occupancy>.85)return null;
 const side=Math.max(x1-x0+1,y1-y0+1)*1.16,cx=(x0+x1)/2,cy=(y0+y1)/2;return {x:cx-side/2,y:cy-side/2,side,occupancy}}
function normalize(a,b){const out=new Float32Array(S*S);if(!b)return a;for(let y=0;y<S;y++)for(let x=0;x<S;x++){const ox=Math.round(b.x+(x+.5)*b.side/S),oy=Math.round(b.y+(y+.5)*b.side/S);out[y*S+x]=ox>=0&&ox<S&&oy>=0&&oy<S?a[oy*S+ox]:0}return out}
function quantile(list,p){const a=list.slice().sort((x,y)=>x-y);return a[Math.floor((a.length-1)*p)]||0}
function meanDiff(a,b){let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/a.length}
function patches(a,b){const size=16, cols=S/size;const scores=[];for(let by=0;by<cols;by++)for(let bx=0;bx<cols;bx++){let d=0,n=0;for(let y=by*size+1;y<(by+1)*size-1;y++)for(let x=bx*size+1;x<(bx+1)*size-1;x++){const i=y*S+x;const ea=Math.abs(a[i]-a[i-1])+Math.abs(a[i]-a[i-S]),eb=Math.abs(b[i]-b[i-1])+Math.abs(b[i]-b[i-S]);d+=Math.abs(ea-eb);n++}scores.push({x:bx,y:by,score:d/n})}return scores}
/* Calibración solo con muestras OK: distribución leave-one-out de puntuaciones.
   No usar el mismo registro como vecino de sí mismo. El resultado sigue siendo exploratorio. */
async function prepare(records){
 const refs=records.filter(r=>r.label==='ok'&&!r.synthetic&&r.thumb).slice(-35);
 const bg=records.filter(r=>r.label==='bg'&&r.thumb).slice(-1)[0];
 if(!bg||!refs.length)return null;
 const background=await fromUrl(bg.thumb),normal=[];
 for(const r of refs){try{const raw=await fromUrl(r.thumb),region=bounds(raw,background);if(region)normal.push({id:r.id,pixels:normalize(raw,region)})}catch(e){}}
 const losses=[];
 if(normal.length>=3){
  for(let i=0;i<normal.length;i++){
   const candidates=normal.filter((_,j)=>i!==j);
   const nearest=candidates.map(o=>({diff:meanDiff(normal[i].pixels,o.pixels),pixels:o.pixels})).sort((a,b)=>a.diff-b.diff)[0];
   if(nearest&&nearest.diff<45){const parts=patches(normal[i].pixels,nearest.pixels).sort((a,b)=>b.score-a.score);losses.push((parts[0].score+parts[1].score)/2)}
  }
 }
 return {background,normal,threshold:losses.length>=3?Math.max(8,quantile(losses,.95)*1.25):null,spread:losses};
}
let prepared=null,signature='';
async function analyze(canvas,records,config={}){
 const ids=records.filter(r=>(r.label==='ok'||r.label==='bg')&&!r.synthetic).map(r=>r.id).join('|');
 if(ids!==signature||!prepared){prepared=await prepare(records);signature=ids}
 if(!prepared||!prepared.normal.length)return {state:'unavailable',reason:'Registra fondo y piezas correctas'};
 const {background,normal}=prepared,input=gray(canvas),box=bounds(input,background);
 if(!box)return {state:'uncertain',reason:'No se distingue la pieza del fondo. Prueba un fondo más contrastado.'};
 const target=normalize(input,box),candidates=normal.map(r=>({...r,diff:meanDiff(target,r.pixels)})).sort((a,b)=>a.diff-b.diff);
 const best=candidates[0];
 const maxDifference=Number(config.maxDifference)||30;
 if(best.diff>maxDifference)return {state:'uncertain',reason:'Vista diferente de las referencias. Añade esta posición como muestra OK.',difference:best.diff,box};
 const grid=patches(target,best.pixels).sort((a,b)=>b.score-a.score);
 const detail=(grid[0].score+grid[1].score)/2;
 const base=prepared.threshold;
 const sensitivity=Number(config.sensitivity)||1;
 // Sin suficientes referencias no emitir rechazos por supuestos microdefectos.
 if(base===null)return {state:'uncertain',reason:'Añade al menos 3 vistas OK para estimar la variación normal.',difference:best.diff,detail,regions:grid.slice(0,3),referenceCount:normal.length};
 const limit=base*sensitivity;
 const suspect=detail>limit*1.15&&best.diff<maxDifference*.85;
 const certain=detail<limit*.75;
 return {state:suspect?'suspect':certain?'compatible':'uncertain',reason:suspect?'Posible anomalía localizada':certain?'Dentro de las variaciones conocidas':'Diferencia ambigua; revisar',difference:best.diff,detail,threshold:limit,regions:grid.slice(0,3),box,referenceCount:normal.length};
}

window.VQCVision=Object.freeze({analyze});
})();