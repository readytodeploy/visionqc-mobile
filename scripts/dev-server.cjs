'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const name of ['.env','.env.local']){const file=path.join(root,name);if(fs.existsSync(file))process.loadEnvFile(file);}
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 res.status=function(code){this.statusCode=code;return this};res.json=function(body){this.setHeader('Content-Type','application/json');this.end(JSON.stringify(body));return this};
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/api/jev'||pathname==='/api/roboflow'){
   if(req.method==='POST'){
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>1_900_000){res.status(413).json({error:'Imagem muito grande'});return;}chunks.push(chunk);}
    try{req.body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return res.status(400).json({error:'JSON inválido'});}
   }
   return await require(path.join(root,pathname==='/api/jev'?'api/jev.js':'api/roboflow.js'))(req,res);
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return res.status(405).end();
  const relative=pathname==='/'?'index.html':pathname.slice(1);
  if(relative!=='index.html'&&!/^(assets|js|config)\//.test(relative))return res.status(404).end();
  const file=path.resolve(root,relative),type=types[path.extname(file)];
  if(!file.startsWith(root+path.sep)||!type)return res.status(404).end();
  const content=await fs.promises.readFile(file);res.setHeader('Content-Type',type);res.end(req.method==='HEAD'?undefined:content);
 }catch{return res.status(404).end();}
});
server.listen(Number(process.env.PORT||8766),'127.0.0.1',()=>console.log('VisionQC: http://localhost:'+server.address().port+' (API local habilitada)'));
