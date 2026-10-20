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
 if(process.env.VQC_REMOTE_ENABLED!=='true'||!password||password.length<20){
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
// A single atomic reservation across every deployment/instance sharing this Redis.
const SCRIPT=`local m=tonumber(redis.call('GET',KEYS[1]) or '0')
local d=tonumber(redis.call('GET',KEYS[2]) or '0')
if m>=tonumber(ARGV[1]) then return {0,redis.call('TTL',KEYS[1])} end
if d>=tonumber(ARGV[2]) then return {0,redis.call('TTL',KEYS[2])} end
if redis.call('INCR',KEYS[1])==1 then redis.call('EXPIRE',KEYS[1],ARGV[3]) end
if redis.call('INCR',KEYS[2])==1 then redis.call('EXPIRE',KEYS[2],ARGV[4]) end
return {1,0}`;
function limit(name,fallback,max){const n=Number(process.env[name]||fallback);if(!Number.isInteger(n)||n<1||n>max)throw Error();return n;}
async function reserve(res){
 if(!enforced())return true;
 try{
  const endpoint=new URL(process.env.UPSTASH_REDIS_REST_URL);
  if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.upstash.io')||endpoint.username||endpoint.password||endpoint.pathname!=='/'||endpoint.search||endpoint.hash)throw Error();
  const token=process.env.UPSTASH_REDIS_REST_TOKEN;if(!token)throw Error();
  const minute=limit('VQC_REQUESTS_PER_MINUTE',6,60),day=limit('VQC_REQUESTS_PER_DAY',60,1000);
  const now=Math.floor(Date.now()/1000),m=Math.floor(now/60),d=Math.floor(now/86400);
  const response=await fetch(endpoint.href,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',SCRIPT,'2','vqc:inspection:minute:'+m,'vqc:inspection:day:'+d,String(minute),String(day),String(60-now%60),String(86400-now%86400)]),signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw Error();
  const data=await response.json(),r=data.result;
  if(data.error||!Array.isArray(r)||r.length!==2||![0,1].includes(r[0])||!Number.isFinite(r[1]))throw Error();
  if(r[0]===0){res.setHeader('Retry-After',String(Math.max(1,r[1])));res.status(429).json({error:'Limite compartilhado de inspeções atingido. Aguarde antes de tentar novamente.'});return false;}
  return true;
 }catch{res.status(503).json({error:'Controle de consumo indisponível. Captura remota bloqueada para proteger os créditos.'});return false;}
}
module.exports={authorize,reserve};
