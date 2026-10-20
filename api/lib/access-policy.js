'use strict';
const {createHash,timingSafeEqual}=require('node:crypto');
const digest=value=>createHash('sha256').update(value).digest();
const enforced=()=>process.env.VERCEL==='1'||process.env.VQC_ENFORCE_ACCESS==='true';
function authorize(req,res){
 if(process.env.VQC_REMOTE_ENABLED==='false'){
  res.status(503).json({error:'Inspeção remota pausada pelo administrador.'});return false;
 }
 if(!enforced())return true;
 const password=process.env.VQC_ACCESS_PASSWORD;
 if(!password||password.length<20){
  res.status(503).json({error:'Inspeção remota bloqueada até configurar o acesso seguro.'});return false;
 }
 const header=req.headers?.authorization||'';
 let decoded='';
 if(typeof header==='string'&&header.startsWith('Basic ')&&header.length<2048)decoded=Buffer.from(header.slice(6),'base64').toString('utf8');
 if(!timingSafeEqual(digest(decoded),digest('inspector:'+password))){
  res.status(401).json({error:'Acesso restrito. Entre com o usuário inspector e a senha de inspeção.'});return false;
 }
 // Origin is an additional CSRF check, never an authentication credential.
 if(req.method==='POST'){
  try{if(!req.headers?.origin||new URL(req.headers.origin).host!==req.headers.host)throw Error();}
  catch{res.status(403).json({error:'Origem não permitida.'});return false;}
 }
 return true;
}
// Best-effort limits in this warm function instance, not a global spending cap.
let minuteWindow=-1,dayWindow=-1,minuteCount=0,dayCount=0;
function limit(name,fallback,max){const n=Number(process.env[name]||fallback);if(!Number.isInteger(n)||n<1||n>max)throw Error();return n;}
async function reserve(res){
 if(!enforced())return true;
 try{
  const minute=limit('VQC_REQUESTS_PER_MINUTE',6,60),day=limit('VQC_REQUESTS_PER_DAY',60,1000);
  const now=Math.floor(Date.now()/1000),m=Math.floor(now/60),d=Math.floor(now/86400);
  if(minuteWindow!==m){minuteWindow=m;minuteCount=0;}
  if(dayWindow!==d){dayWindow=d;dayCount=0;}
  const retry=dayCount>=day?86400-now%86400:minuteCount>=minute?60-now%60:0;
  if(retry){res.setHeader('Retry-After',String(retry));res.status(429).json({error:'Limite temporário de inspeções atingido. Aguarde antes de tentar novamente.'});return false;}
  // No await between checking and reserving: concurrent requests in this instance share counts.
  minuteCount++;dayCount++;return true;
 }catch{res.status(503).json({error:'Limites de inspeção inválidos. Verifique a configuração do servidor.'});return false;}
}
module.exports={authorize,reserve,requiresAccess:enforced};
