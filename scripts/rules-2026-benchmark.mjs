import fs from 'node:fs';
import path from 'node:path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { detectIndicazioni2026 } from '../src/rules/indicazioni-2026.js';

const input=process.argv[2];
if(!input){
  console.error('Uso: node scripts/rules-2026-benchmark.mjs <file.pdf> [report.json]');
  process.exit(2);
}
const outPath=process.argv[3] || path.resolve(process.cwd(),'rules-2026-benchmark-report.json');
const data=new Uint8Array(fs.readFileSync(input));
const pdf=await pdfjsLib.getDocument({data,disableWorker:true}).promise;
const all=[];
for(let p=1;p<=pdf.numPages;p++){
  const page=await pdf.getPage(p);
  const tc=await page.getTextContent();
  const text=tc.items.map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
  const found=detectIndicazioni2026({text,pageNumber:p});
  all.push(...found);
}
const seen=new Set();
const findings=all.filter(f=>{
  const k=[f.page,f.key,String(f.value).toLowerCase(),f.ruleId].join('|');
  if(seen.has(k)) return false;
  seen.add(k);
  return true;
});
const summary={};
for(const f of findings) summary[f.ruleId]=(summary[f.ruleId]||0)+1;
const report={
  source:path.basename(input),
  pages:pdf.numPages,
  generatedAt:new Date().toISOString(),
  totalFindings:findings.length,
  summary,
  findings
};
fs.writeFileSync(outPath,JSON.stringify(report,null,2));
console.log(JSON.stringify({pages:report.pages,totalFindings:report.totalFindings,summary:report.summary,report:outPath},null,2));
