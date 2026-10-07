import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function getFunction(name){
 const start=source.indexOf('function '+name+'(');
 assert.ok(start>=0);
 return source.slice(start,source.indexOf('\nfunction ',start+1));
}
const context=vm.createContext({state:{precisionMode:'precise'}, cleanNameCell:s=>s, foldToken:s=>s.replace(/[^a-z0-9]/gi,'').toUpperCase(), ocrLines:p=>[p.ocrWords]});
vm.runInContext(getFunction('ocrRectsForFinding'),context);
const word=(text,x)=>({text,bbox:{x0:x,y0:20,x1:x+8,y1:30}});
function rect(value,words){return context.ocrRectsForFinding({value},{viewport:{width:100,height:100},ocrWords:words});}
test('punctuation does not shift OCR boxes to a different word',()=>{
 const [r]=rect('Mario Rossi',[word('.',0),word('Mario',20),word('Rossi',40)]);
 assert.equal(r.x,.19); assert.equal(r.w,.3);
});
test('phrases longer than four OCR tokens are located',()=>{
 assert.equal(rect('Uno Due Tre Quattro Cinque',[word('Uno',0),word('Due',10),word('Tre',20),word('Quattro',30),word('Cinque',40)]).length,1);
});
test('unmatched findings do not acquire arbitrary boxes',()=>assert.equal(rect('Maria',[word('Mario',20)]).length,0));
test('repeated OCR tokens yield repeatable geometry',()=>{
 const words=[word('Mario',20),word('Rossi',40)];
 assert.equal(JSON.stringify(rect('Mario Rossi',words)),JSON.stringify(rect('Mario Rossi',words)));
});
const fields=source.match(/const DOCUMENT_FIELDS=([^;]+);/)[1];
vm.runInContext('const DOCUMENT_FIELDS='+fields+';'+getFunction('saveDocument')+getFunction('clearDocument'),context);
test('file results are saved separately before clearing active state',()=>{
 const file={name:'one.pdf'}; Object.assign(context.state,{files:[file],currentIndex:0,documents:new Map(),findings:[{value:'test'}],pdfBytes:new Uint8Array([1]),pages:[]});
 context.saveDocument(); context.clearDocument();
 assert.equal(context.state.findings.length,0);
 assert.equal(context.state.pdfBytes,null);
 assert.equal(context.state.documents.get(file).findings[0].value,'test');
});
