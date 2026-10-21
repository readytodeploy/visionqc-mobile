(function(){
'use strict';
function frameSize(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<280||height<280)throw new Error('A câmera ainda não fornece uma imagem com detalhes suficientes. Aguarde ou use outra câmera.');
 const scale=Math.min(1,1536/Math.max(width,height));
 const size={width:Math.round(width*scale),height:Math.round(height*scale)};
 if(Math.min(size.width,size.height)<280)throw new Error('Formato de câmera muito estreito. Altere a orientação ou a câmera.');
 return size;
}
function captureFrame(video,canvas){
 if(video.readyState<2)throw new Error('Aguarde a imagem da câmera antes de capturar.');
 const size=frameSize(video.videoWidth,video.videoHeight);canvas.width=size.width;canvas.height=size.height;
 canvas.getContext('2d').drawImage(video,0,0,video.videoWidth,video.videoHeight,0,0,size.width,size.height);
 return canvas;
}
function encode(canvas){
 for(const quality of [.9,.82,.72]){const image=canvas.toDataURL('image/jpeg',quality);if(image.length<=1800000)return image;}
 throw new Error('Imagem muito grande para enviar. Reduza detalhes do fundo ou a resolução da câmera.');
}
function thumbnail(canvas){
 const small=document.createElement('canvas'),scale=Math.min(1,320/Math.max(canvas.width,canvas.height));
 small.width=Math.round(canvas.width*scale);small.height=Math.round(canvas.height*scale);small.getContext('2d').drawImage(canvas,0,0,small.width,small.height);return small.toDataURL('image/jpeg',.65);
}
async function infer(canvas,objectName,criteria,image=encode(canvas)){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30000);
 try{
  const response=await fetch('/api/jev',{method:'POST',headers:{'Content-Type':'application/json',...(window.VQCAccess?.headers()||{})},body:JSON.stringify({profile:'jev',image,objectName,criteria}),signal:abort.signal});
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
window.VQCJev=Object.freeze({infer,captureFrame,frameSize,encode,thumbnail});
})();
