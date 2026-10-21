const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function client(){const context={window:{},setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync('js/jev-client.js','utf8'),context);return context.window.VQCJev;}
test('full-frame capture preserves landscape/portrait proportions, includes all pixels and bounds transfer size',()=>{
 const c=client();
 for(const [w,h,expected] of [[1280,720,[1280,720]],[3840,2160,[1536,864]],[1080,1920,[864,1536]],[3000,3000,[1536,1536]]]){
  const size=c.frameSize(w,h);assert.deepEqual([size.width,size.height],expected);
  let args;const video={readyState:4,videoWidth:w,videoHeight:h};const canvas={getContext:()=>({drawImage(...a){args=a;}})};
  c.captureFrame(video,canvas);assert.deepEqual(args.slice(1),[0,0,w,h,0,0,...expected]);assert.equal(args[0],video);
 }
 assert.throws(()=>c.frameSize(0,720));assert.throws(()=>c.frameSize(4096,280));
 assert.throws(()=>c.captureFrame({readyState:1},{}));
 const qualities=[];const encoded=c.encode({toDataURL(type,q){qualities.push(q);return q>.85?'x'.repeat(1800001):'jpeg-under-limit';}});
 assert.equal(encoded,'jpeg-under-limit');assert.deepEqual(qualities,[.9,.82]);
 assert.throws(()=>c.encode({toDataURL(){return 'x'.repeat(1800001);}}));
});
