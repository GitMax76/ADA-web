import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseOrientation,orientationScore,recognizeOrientedPage} from '../src/ocr-layout.js';

test('clear orientation wins, irrespective of PDF rotation metadata',()=>{
  assert.equal(chooseOrientation([{rotation:90,score:10,order:0},{rotation:0,score:90,order:1}],90).rotation,0);
});
test('ambiguous orientation preserves original and flags manual review',()=>{
  const r=chooseOrientation([{rotation:90,score:60,order:0},{rotation:0,score:64,order:1}],90);
  assert.equal(r.rotation,90);assert.equal(r.uncertain,true);
});
test('a few words in a photograph cannot justify rotating the page',()=>{
  assert.ok(orientationScore({text:'Casa',confidence:99})<10);
});
test('OCR final pass uses selected rotation and higher resolution',async()=>{
  const calls=[];
  const r=await recognizeOrientedPage({worker:{},rotation:90,checkCancelled:()=>{},onProgress:()=>{},
    render:async(rotation,scale)=>({rotation,scale}),
    recognize:async(w,image,blocks)=>{calls.push({...image,blocks});return {data:{text:'parola '.repeat(30),confidence:image.rotation===0?95:20}};}
  });
  assert.equal(r.rotation,0);assert.deepEqual(calls.at(-1),{rotation:0,scale:3,blocks:true});
  assert.equal(calls.length,5);
});
test('cancellation prevents further OCR work',async()=>{
  await assert.rejects(recognizeOrientedPage({worker:{},rotation:0,checkCancelled:()=>{throw Error('cancelled');},onProgress:()=>{}}),/cancelled/);
});
