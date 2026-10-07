import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createWorker } from 'tesseract.js';
import { recognizeOrientedPage } from '../src/ocr-layout.js';

const directory=path.resolve('../output/ada-test/ocr-inputs');
const jobs=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
const results=[];
for(let run=1;run<=2;run++){
  const worker=await createWorker('ita',1,{cachePath:directory},{classify_enable_learning:'0'});
  try{
    for(const job of jobs){
      const result=await recognizeOrientedPage({
        worker,rotation:job.rotation,checkCancelled:()=>{},
        render:async(angle,scale)=>job.images[`${angle}/${scale}`],
        recognize:(w,image,blocks)=>w.recognize(image,{}, {text:true,blocks}),
        onProgress:label=>console.log(`run ${run}: ${job.id}: ${label}`),
      });
      const fingerprint=crypto.createHash('sha256').update(JSON.stringify({text:result.data.text,blocks:result.data.blocks})).digest('hex');
      const record={id:job.id,run,rotation:result.rotation,uncertain:result.uncertain,candidates:result.candidates,confidence:result.data.confidence,fingerprint};
      results.push(record);
      fs.writeFileSync(path.join(directory,`${job.id}-run${run}.json`),JSON.stringify(result));
      fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(results,null,2));
      console.log(JSON.stringify(record));
    }
  }finally{await worker.terminate();}
}
for(const job of jobs){
  const pair=results.filter(r=>r.id===job.id);
  if(pair[0].fingerprint!==pair[1].fingerprint) throw Error(`Non-repeatable OCR: ${job.id}`);
}
console.log('All sample OCR text and coordinates match across two independent workers.');
