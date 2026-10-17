/* VisionQC v2: segmentación conservadora de producto y comparación local multirregión.
   No es segmentación semántica ni detección certificada de microdefectos. */
(function(){
'use strict';
const S=96, cache=new Map();
function gray(canvas){const c=document.createElement('canvas');c.width=c.height=S;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,S,S);const rgba=ctx.getImageData(0,0,S,S).data;const out=new Float32Array(S*S);for(let i=0;i<out.length;i++)out[i]=.299*rgba[i*4]+.587*rgba[i*4+1]+.114*rgba[i*4+2];return out}
function fromUrl(src){if(cache.has(src))return cache.get(src);const p=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=c.height=S;c.getContext('2d').drawImage(img,0,0,S,S);resolve(gray(c))};img.onerror=reject;img.src=src});cache.set(src,p);if(cache.size>55)cache.delete(cache.keys().next().value);return p}
function bounds(a,b){let x0=S,y0=S,x1=-1,y1=-1,changed=0;for(let y=2;y<S-2;y++)for(let x=2;x<S-2;x++){const i=y*S+x;if(Math.abs(a[i]-b[i])>24){changed++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
 const occupancy=changed/(S*S);if(occupancy<.025||occupancy>.85)return null;
 const side=Math.max(x1-x0+1,y1-y0+1)*1.16,cx=(x0+x1)/2,cy=(y0+y1)/2;return {x:cx-side/2,y:cy-side/2,side,occupancy}}
function normalize(a,b){const out=new Float32Array(S*S);if(!b)return a;for(let y=0;y<S;y++)for(let x=0;x<S;x++){const ox=Math.round(b.x+(x+.5)*b.side/S),oy=Math.round(b.y+(y+.5)*b.side/S);out[y*S+x]=ox>=0&&ox<S&&oy>=0&&oy<S?a[oy*S+ox]:0}return out}
function meanDiff(a,b){let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/a.length}
function patches(a,b){const size=16, cols=S/size;const scores=[];for(let by=0;by<cols;by++)for(let bx=0;bx<cols;bx++){let d=0,n=0;for(let y=by*size+1;y<(by+1)*size-1;y++)for(let x=bx*size+1;x<(bx+1)*size-1;x++){const i=y*S+x;const ea=Math.abs(a[i]-a[i-1])+Math.abs(a[i]-a[i-S]),eb=Math.abs(b[i]-b[i-1])+Math.abs(b[i]-b[i-S]);d+=Math.abs(ea-eb);n++}scores.push({x:bx,y:by,score:d/n})}return scores}
async function analyze(canvas,records,config={}){
 const refs=records.filter(r=>r.label==='ok'&&!r.synthetic&&r.thumb).slice(-35),bg=records.filter(r=>r.label==='bg'&&r.thumb).slice(-1)[0];
 if(!refs.length||!bg)return {state:'unavailable',reason:'Falta imagen OK o fondo'};
 const background=await fromUrl(bg.thumb),input=gray(canvas),box=bounds(input,background);
 if(!box)return {state:'uncertain',reason:'No se distingue la pieza del fondo; ajusta iluminación o encuadre.'};
 const target=normalize(input,box);let best=null;
 for(const r of refs){try{const ref=await fromUrl(r.thumb),region=bounds(ref,background);if(!region)continue;const norm=normalize(ref,region),difference=meanDiff(target,norm);if(!best||difference<best.diff)best={diff:difference,ref:norm,id:r.id}}catch(e){}}
 if(!best)return {state:'uncertain',reason:'No se pudo alinear ninguna imagen OK'};
 // Las variaciones grandes de punto de vista invalidan la comparación local.
 if(best.diff>31)return {state:'uncertain',reason:'Ángulo o acercamiento diferente de las referencias. Añade esta vista como muestra OK si corresponde.',difference:best.diff,box};
 const grid=patches(target,best.ref).sort((a,b)=>b.score-a.score);
 const detail=(grid[0].score+grid[1].score)/2;
 const sensitivity=Number(config.sensitivity)||1;
 // Umbrales provisionales: requieren calibración por producto y defectos reales.
 const isCandidate=refs.length>=5&&best.diff<21&&detail>28*sensitivity;
 return {state:isCandidate?'suspect':'compatible',difference:best.diff,detail,regions:grid.slice(0,3),box,referenceCount:refs.length};
}
window.VQCVision=Object.freeze({analyze});
})();