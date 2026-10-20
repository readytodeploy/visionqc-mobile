/* VisionQC — Roboflow RF-DETR client. Inference requires Vercel /api/roboflow proxy. */
(function(){
'use strict';
async function infer(canvas,confidence,profile='mdf'){
 const base64=canvas.toDataURL('image/jpeg',.9);
 const response=await fetch('/api/roboflow',{method:'POST',headers:{'Content-Type':'application/json',...(window.VQCAccess?.headers()||{})},body:JSON.stringify({image:base64,confidence,profile})});
 let data;try{data=await response.json()}catch(e){throw new Error('El servidor respondió con un formato inesperado')}
 if(!response.ok)throw new Error(data.error||'No se pudo consultar Roboflow');
 return data;
}
window.VQCRoboflow=Object.freeze({infer});
})();