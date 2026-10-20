(function(){
'use strict';
async function infer(canvas,objectName,criteria){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);
 try{
  const response=await fetch('/api/jev',{method:'POST',headers:{'Content-Type':'application/json',...(window.VQCAccess?.headers()||{})},body:JSON.stringify({profile:'jev',image:canvas.toDataURL('image/jpeg',.9),objectName,criteria}),signal:abort.signal});
  let data;try{data=await response.json()}catch{throw new Error('Backend Jev indisponível. Execute o servidor de desenvolvimento com API.')}
  if(!response.ok)throw new Error(data.error||'Não foi possível consultar o Jev.');
  if(!['defect','review'].includes(data.verdict)||!data.experimental)throw new Error('Resposta Jev inválida.');
  return data;
 }finally{clearTimeout(timer)}
}
window.VQCJev=Object.freeze({infer});
})();
