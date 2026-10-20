'use strict';
const DEFECTS={seam:'Falha de costura',stain:'Mancha',tear:'Rasgo ou furo',damage:'Dano de superfície',loose_thread:'Linha solta',weave:'Falha na trama',abrasion:'Abrasão ou risco',deformation:'Deformação',finish:'Falha de acabamento',other:'Outro defeito',none:'Sem defeito visível',uncertain:'Indeterminado'};
const unit=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
function normalize(data){
 const a=data?.answers,d=a?.decision,t=a?.defect_type,b=a?.defect_box;
 if(typeof data?.model!=='string'||data.model!=='jev-1.14.0'||d?.type!=='choice'||!['defect','clear','uncertain'].includes(d.choice)||!unit(d.confidence)||t?.type!=='choice'||!Object.hasOwn(DEFECTS,t.choice)||!unit(t.confidence))throw new Error('invalid upstream response');
 const q=a?.capture_quality,o=a?.object_scope,e=a?.evidence;
 const validChoice=(x,choices)=>x?.type==='choice'&&choices.includes(x.choice)&&unit(x.confidence);
 if(!validChoice(q,['usable','blur','lighting','occluded','too_small','no_object','uncertain'])||!validChoice(o,['matches','different','uncertain'])||!validChoice(e,['physical','normal_variation','artifact','none','uncertain']))throw new Error('invalid upstream response');
 const qualityOK=q.choice==='usable'&&q.confidence>=.7,scopeOK=o.choice==='matches'&&o.confidence>=.7,evidenceOK=e.choice==='physical'&&e.confidence>=.75;
 const certain=qualityOK&&scopeOK&&evidenceOK&&d.choice==='defect'&&d.confidence>=.85&&t.confidence>=.7&&!['none','uncertain'].includes(t.choice);
 const edges=b?.box;
 const validBox=b?.type==='box'&&unit(b.confidence)&&b.confidence>=.7&&edges&&['left','top','right','bottom'].every(k=>unit(edges[k]))&&edges.left<edges.right&&edges.top<edges.bottom;
 const reasons={blur:'Refaça a captura: imagem desfocada.',lighting:'Refaça a captura: ajuste a iluminação e os reflexos.',occluded:'Refaça a captura: desobstrua a superfície.',too_small:'Refaça a captura: aproxime a região inspecionada.',no_object:'Posicione o objeto dentro da moldura.',uncertain:'Qualidade da captura inconclusiva; revise ou capture novamente.'};
 const reviewReason=!qualityOK?(reasons[q.choice]||'Qualidade insuficientemente confirmada; refaça a captura.'):!scopeOK?(o.choice==='different'?'O objeto não corresponde ao configurado. Revise o objeto ou a captura.':'Não foi possível confirmar o objeto configurado.'):e.choice==='normal_variation'?'Possível variação normal de textura, estampa ou acabamento. Confirme visualmente.':e.choice==='artifact'?'Possível reflexo, sombra ou artefato de imagem. Ajuste a captura.':d.choice==='clear'&&d.confidence>=.85&&t.choice==='none'&&t.confidence>=.7&&e.choice==='none'&&e.confidence>=.75?'Sem defeito aparente no recorte. Confirme visualmente.':'Evidência inconclusiva ou respostas divergentes; faça revisão manual.';
 return {model:data.model,assessment:d.choice,verdict:certain?'defect':'review',confidence:d.confidence,captureQuality:q.choice,objectScope:o.choice,evidence:e.choice,reviewReason:certain?null:reviewReason,defectType:DEFECTS[t.choice],box:certain&&validBox?{left:edges.left,top:edges.top,right:edges.right,bottom:edges.bottom}:null,boxConfidence:certain&&validBox?b.confidence:null,experimental:true,production_ready:false};
}
function jpegSize(buf){
 if(buf.length<4||buf.readUInt16BE(0)!==0xffd8||buf.readUInt16BE(buf.length-2)!==0xffd9)throw new Error('JPEG inválido');
 let i=2;
 while(i+4<=buf.length){
  if(buf[i++]!==255)throw new Error('JPEG inválido');
  while(buf[i]===255)i++;
  const marker=buf[i++];if(marker===0xda||marker===0xd9)break;
  if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;
  if(i+2>buf.length)break;
  const length=buf.readUInt16BE(i);if(length<2||i+length>buf.length)break;
  if([0xc0,0xc1,0xc2].includes(marker)&&length>=8)return {width:buf.readUInt16BE(i+5),height:buf.readUInt16BE(i+3)};
  i+=length;
 }
 throw new Error('Dimensões JPEG indisponíveis');
}
module.exports={normalize,jpegSize};
