'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
// Only these reviewed runtime files can become public assets.
const files=['index.html','assets/styles.css','js/app.js','js/access-client.js','js/product-vision.js','js/reference-mode.js','js/roboflow-client.js','js/jev-client.js','config/model-profiles.json'];
fs.rmSync(out,{recursive:true,force:true});
for(const file of files){const src=path.join(root,file);if(fs.lstatSync(src).isSymbolicLink())throw Error('Symlink forbidden: '+file);const dst=path.join(out,file);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);}
console.log('Built '+files.length+' reviewed public files in dist/');
