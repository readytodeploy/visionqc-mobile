(function(){
'use strict';
async function infer(canvas,objectName,criteria){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);
 try{
  const response=await fetch('/api/jev',{method:'POST',headers:{'Content-Type':'application/json',...(window.VQCAccess?.headers()||{})},body:JSON.stringify({profile:'jev',image:canvas.toDataURL('image/jpeg',.9),objectName,criteria}),signal:abort.signal});
  let data;try{data=await response.json()}catch{throw new Error('O servidor não retornou uma resposta válida do Jev. Tente novamente.')}
  if(!response.ok)throw new Error(data.error||'Não foi possível consultar o Jev.');
  if(!['defect','review'].includes(data.verdict)||!data.experimental)throw new Error('Resposta Jev inválida.');
  return data;
 }catch(error){
  if(error.name==='AbortError')throw new Error('O Jev demorou para responder. Tente capturar novamente.');
  if(error instanceof TypeError)throw new Error('Não foi possível conectar ao Jev. Confira a internet e tente novamente.');
  throw error;
 }finally{clearTimeout(timer)}
}
window.VQCJev=Object.freeze({infer});
})();
