'use strict';
const {authorize,reserve,requiresAccess}=require('./lib/access-policy');
const {buildPayload,PROMPT_VERSION}=require('./lib/jev-prompt');
const {randomUUID}=require('node:crypto');
const {normalize,jpegSize}=require('./lib/jev-policy');
const ENDPOINT='https://api.typesafe.ai/v1/systemone';
const MODEL='jev-1.14.0';
const credential=()=>process.env.AI_JEV_API_KEY;
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!authorize(req,res))return;
 if(req.method==='GET')return res.status(200).json({configured:Boolean(credential()),accessVerified:requiresAccess(),provider:'typesafe',model:MODEL,experimental:true});
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Método não permitido'});}
 if(req.headers?.origin&&req.headers?.host){try{if(new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'Origem não permitida'});}catch{return res.status(403).json({error:'Origem inválida'});}}
 const {image,objectName='Peça de tecido',criteria='Manchas, rasgos, furos e falhas de costura',profile}=req.body||{};
 if(profile!=='jev')return res.status(409).json({error:'Esta rota exige o modo Jev experimental.'});
 if(typeof image!=='string'||image.length>1_800_000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image))return res.status(400).json({error:'Envie um JPEG válido de até 1,3 MB.'});
 if(typeof objectName!=='string'||!objectName.trim()||objectName.length>80||typeof criteria!=='string'||!criteria.trim()||criteria.length>600)return res.status(400).json({error:'Informe o objeto (até 80 caracteres) e os defeitos (até 600).'});
 let size;const base64=image.slice('data:image/jpeg;base64,'.length);
 try{const bytes=Buffer.from(base64,'base64');if(bytes.toString('base64')!==base64)throw Error();size=jpegSize(bytes);if(size.width<280||size.height<280||size.width>1568||size.height>1568)throw Error();}catch{return res.status(400).json({error:'JPEG inválido ou dimensões fora de 280–1568 pixels.'});}
 const key=credential();if(!key)return res.status(503).json({error:'Configure AI_JEV_API_KEY no servidor para usar o Jev diretamente.'});
 if(!await reserve(res))return;
 const reference=randomUUID();
 const payload=buildPayload({model:MODEL,reference,base64,objectName,criteria,imageSize:size});
 const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),25000);
 try{
  const upstream=await fetch(ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','TypeSafe-Danger-Zone-Images':'true'},body:JSON.stringify(payload),signal:abort.signal});
  if(!upstream.ok){
   const errors={401:'Credencial Jev inválida ou revogada. Verifique AI_JEV_API_KEY no servidor.',402:'Saldo ou limite do Jev atingido. Verifique sua conta TypeSafe AI.',403:'Acesso negado pela TypeSafe AI. Verifique o plano e o acesso a Images/Box.',429:'Limite de requisições do Jev atingido. Tente novamente mais tarde.'};
   return res.status(upstream.status===401?502:errors[upstream.status]?upstream.status:502).json({error:errors[upstream.status]||'Jev indisponível na TypeSafe AI. Verifique a credencial e o acesso ao modelo no servidor.'});
  }
  const result=normalize(await upstream.json());
  return res.status(200).json({...result,promptVersion:PROMPT_VERSION,provider:'typesafe',image:size});
 }catch(e){return res.status(e.name==='AbortError'?504:502).json({error:e.name==='AbortError'?'O Jev demorou para responder. Tente novamente.':'Não foi possível validar a resposta do Jev. Faça revisão manual.'});}
 finally{clearTimeout(timer);}
};
