import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {completeAddresses} from '../src/contact-regions.js';

// Exercise the actual application recognizers without a browser or personal fixtures in Git.
export function detectionHarness(){
  const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const context=vm.createContext({crypto:webcrypto,completeAddresses,state:{findings:[],precisionMode:'precise',redactionMode:'black'}});
  const constants=source.slice(source.indexOf('const PATTERNS ='),source.indexOf('function escapeHtml'));
  const detectors=source.slice(source.indexOf('function extractOcrWords'),source.indexOf('function syncFindingFilterControls'));
  const rects=source.slice(source.indexOf('function ocrRectsForFinding'),source.indexOf('function resolveRectsForFinding'));
  const paint=source.slice(source.indexOf('function paintRedaction'),source.indexOf('function appendManualBox'));
  vm.runInContext(constants+detectors+rects+paint,context);
  return {
    paint:context.paintRedaction,
    words:context.extractOcrWords,
    detect(data,viewport={width:1800,height:2500}){
      context.state.findings=[];
      const page={pageNumber:1,items:[],text:'',ocrText:data.text,ocrWords:context.extractOcrWords(data),viewport};
      context.detectPage(page);context.dedupeFindings();
      return context.state.findings.map(f=>({...f,rects:context.ocrRectsForFinding(f,page)}));
    },
    addresses(line){
      context.state.findings=[];context.addAddressFromLine(line,1);
      return context.state.findings;
    }
  };
}
