/* VisionQC: referencia OK, modelo de anomalías exploratorio basado en parches existentes. */
(function(){
 'use strict';
 function cosine(a,b){let v=0;for(let i=0;i<a.length;i++)v+=a[i]*b[i];return v;}
 function predict(embedding,records,sensitivity){
  const ok=records.filter(r=>r.label==='ok'&&!r.synthetic&&Array.isArray(r.emb)&&r.emb.length>=10);
  if(!ok.length)return {label:'uncertain',score:0,anomaly:1,threshold:0,reason:'Registra una imagen correcta.'};
  const bank=ok.slice(-40).flatMap(r=>r.emb.slice(1));
  const differences=embedding.slice(1).map(p=>{
   let nearest=Infinity;
   for(const q of bank){const d=Math.max(0,1-cosine(p,q));if(d<nearest)nearest=d;}
   return nearest;
  }).sort((a,b)=>b-a);
  const anomaly=(differences[0]+differences[1])/2;
  // Una sola foto no permite calibrar estadísticamente un umbral universal.
  const level=Number(sensitivity)||1;
  const threshold=(ok.length<3?.12:.10)*level;
  const label=anomaly>threshold*1.2?'ko':anomaly<threshold*.65?'ok':'uncertain';
  return {label,score:Math.max(0,1-anomaly),anomaly,threshold,experimental:ok.length<3};
 }
 window.VQCReference=Object.freeze({predict});
})();
