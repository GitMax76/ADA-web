import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completeAddresses,signatureSuggestion} from '../src/contact-regions.js';
import {detectionHarness} from './detection-harness.mjs';

test('full address includes street type, civic number, postcode, city and province',()=>{
  assert.deepEqual(completeAddresses('Via Roma, 21, 10100, Torino (TO)'),['Via Roma, 21, 10100, Torino (TO)']);
});
test('postcode separator is not swallowed as a civic-number suffix',()=>{
  assert.deepEqual(completeAddresses('Via S. Carlo, 35 - 10100 Torino (TO)'),['Via S. Carlo, 35 - 10100 Torino (TO)']);
});
test('civic suffix, no space after comma and postal continuation line',()=>{
  assert.deepEqual(completeAddresses('Via Roma,21/A'),['Via Roma,21/A']);
  assert.deepEqual(completeAddresses('10100 Torino (TO)'),['10100 Torino (TO)']);
});
test('address does not absorb surrounding personal narrative',()=>{
  assert.deepEqual(completeAddresses('nata a Torino residente alla Via Roma n. 289, in qualita di socio'),['Via Roma n. 289']);
});
test('ordinary prose is not an address',()=>{
  assert.deepEqual(completeAddresses('estratto stradario con indicazione precisa'),[]);
  assert.deepEqual(completeAddresses('localita protetta da simili'),[]);
});
test('institutional and spaced OCR email addresses are both recognized',()=>{
  for(const value of ['ufficio@pec.example.it','ufficio @ pec . example . it']){
    assert.ok(detectionHarness().detect({text:value,blocks:[]}).some(f=>f.key==='email' && f.value===value));
  }
});
function signatureFixture(ink){
  const width=500,height=700,pixels=new Uint8ClampedArray(width*height*4).fill(255);
  if(ink) for(let y=152;y<178;y++)for(let x=260;x<420;x++){
    if((x+y)%5<2){const i=(y*width+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=20;}
  }
  const words=[{text:'dott.',lineId:0,bbox:{x0:265,y0:110,x1:290,y1:130}},{text:'Mario Rossi',lineId:0,bbox:{x0:300,y0:110,x1:440,y1:130}}];
  return {words,width,height,pixels};
}
test('dark region below final signatory produces a bounded review suggestion',()=>{
  const f=signatureFixture(true),r=signatureSuggestion(f.words,f.width,f.height,f.pixels);
  assert.ok(r);assert.ok(r.x>=0 && r.y>=0 && r.x+r.w<=1 && r.y+r.h<=1);
  assert.ok(r.x<=260/500 && (r.x+r.w)>=420/500);
});
test('blank signature space is not proposed as detected ink',()=>{
  const f=signatureFixture(false);
  assert.equal(signatureSuggestion(f.words,f.width,f.height,f.pixels),null);
});
test('letterhead above body is not used as signature anchor',()=>{
  const f=signatureFixture(true);f.words.push({text:'Oggetto: testo della lettera',lineId:1,bbox:{x0:20,y0:300,x1:450,y1:320}});
  assert.equal(signatureSuggestion(f.words,f.width,f.height,f.pixels),null);
});
