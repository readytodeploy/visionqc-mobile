(function(){
'use strict';
let authorization='';
window.VQCAccess=Object.freeze({
 unlock(password){authorization=password?'Basic '+btoa(String.fromCharCode(...new TextEncoder().encode('inspector:'+password))):'';},
 headers(){return authorization?{Authorization:authorization}:{};}
});
})();
