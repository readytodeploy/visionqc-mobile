'use strict';
const {authorize,reserve}=require('./lib/access-policy');
/** Roboflow inference proxy. Keep ROBOFLOW_API_KEY in Vercel env, never in browser. */
const MODELS=['inspecao-de-molduras-mdf-pretas-3-rfdetr-small-t1','inspecao-de-molduras-mdf-pretas/3'];
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!authorize(req,res))return;
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método no permitido'});}
 const key=process.env.ROBOFLOW_API_KEY;
 if(!key)return res.status(503).json({error:'Roboflow no está configurado. Define ROBOFLOW_API_KEY en Vercel.'});
 const {image,confidence=50,profile='mdf'}=req.body||{};
 if(profile!=='mdf')return res.status(409).json({error:'Modelo indisponível para este produto: é necessário treinar e validar um modelo específico.'});
 if(typeof image!=='string'||image.length>1_800_000||!/^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(image))return res.status(400).json({error:'Envía un JPEG válido de menos de 1,3 MB'});
 const threshold=Number(confidence);
 if(!Number.isFinite(threshold)||threshold<5||threshold>95)return res.status(400).json({error:'Confianza fuera de rango (5-95)'});
 if(!await reserve(res))return;
 const body=image.slice('data:image/jpeg;base64,'.length);
 const errors=[];
 for(const model of MODELS){
  const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),20000);
  try{
   const url='https://serverless.roboflow.com/'+model+'?api_key='+encodeURIComponent(key)+'&confidence='+Math.round(threshold)+'&format=json';
   const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:abort.signal});
   if(!response.ok){errors.push(model+': HTTP '+response.status);continue}
   let json=await response.json();if(Array.isArray(json))json=json[0]||{};
   if(!json||!Array.isArray(json.predictions))return res.status(502).json({error:'Respuesta inesperada de Roboflow'});
   const predictions=json.predictions.slice(0,60).map(p=>({x:Number(p.x)||0,y:Number(p.y)||0,width:Number(p.width)||0,height:Number(p.height)||0,confidence:Math.max(0,Math.min(1,Number(p.confidence)||0)),class:String(p.class||p.class_name||'Defecto').slice(0,80)}));
   return res.status(200).json({model, predictions, image:{width:Number(json.image?.width)||448,height:Number(json.image?.height)||448}});
  }catch(error){errors.push(error.name==='AbortError'?'Tiempo de espera agotado':'Error de conexión con Roboflow');}
  finally{clearTimeout(timer)}
 }
 return res.status(502).json({error:'No se pudo consultar el modelo configurado.',details:errors});
};